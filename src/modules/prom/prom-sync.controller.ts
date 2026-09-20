import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
  forwardRef,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  ImportPromCatalogJobData,
  ExportPromCatalogJobData,
} from '../queue/queue.constants';
import { SyncService } from '../queue/sync.service';
import { PromApiClient } from './prom-api.client';
import { PromSyncService } from './prom-sync.service';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('Prom.ua')
@Controller('prom/:tenantId')
export class PromSyncController {
  private readonly logger = new Logger(PromSyncController.name);

  constructor(
    private readonly promApiClient: PromApiClient,
    private readonly promSyncService: PromSyncService,
    private readonly tenantService: TenantService,
    private readonly limanService: LimanService,
    @Optional()
    @InjectQueue(QUEUE_NAMES.IMPORT_PROM_CATALOG)
    private readonly importCatalogQueue?: Queue<ImportPromCatalogJobData>,
    @Optional()
    @InjectQueue(QUEUE_NAMES.EXPORT_PROM_CATALOG)
    private readonly exportCatalogQueue?: Queue<ExportPromCatalogJobData>,
    @Optional()
    @Inject(forwardRef(() => SyncService))
    private readonly queueSyncService?: SyncService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  private async getPromToken(tenantId: string): Promise<string> {
    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.promApiKey) {
      throw new BadRequestException(
        `Prom API Token не задан для тенанта "${tenantId}". Укажите promApiKey в настройках клиента (в БД).`,
      );
    }
    return tenant.promApiKey;
  }

  @Get('ping')
  @ApiOperation({
    summary: 'Проверить подключение к Prom.ua API по токену магазина',
    description:
      'Выполняет тестовый запрос к Prom.ua API и возвращает статус подключения, название магазина и базовые счетчики.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Подключение к Prom.ua успешно' })
  async ping(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    const token = await this.getPromToken(tenantId);
    const result = await this.promApiClient.ping(token);

    // Автоматическое сохранение официального названия магазина Prom.ua
    if (
      result.shopTitle &&
      (!tenant.promShopTitle || tenant.promShopTitle !== result.shopTitle)
    ) {
      try {
        await this.tenantService.update(tenantId, {
          promShopTitle: result.shopTitle,
        });
      } catch (err: any) {
        this.logger.warn(
          `Не удалось обновить promShopTitle для ${tenantId}: ${err.message}`,
        );
      }
    }

    return {
      tenantId,
      ...result,
    };
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Получить журнал активности и событий интеграции с Prom.ua',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Список последних событий' })
  getActivity(@Param('tenantId') tenantId: string) {
    return this.promSyncService.getActivities(tenantId);
  }

  @Get('mappings/stats')
  @ApiOperation({
    summary: 'Получить статистику сопоставления товаров (product_mappings)',
    description:
      'Возвращает количество связанных (synced), ошибочных (error) и общее число товаров для витрины Prom.ua.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'integrationId', required: false })
  async getMappingStats(
    @Param('tenantId') tenantId: string,
    @Query('integrationId') integrationId?: string,
  ) {
    return this.promSyncService.getMappingStats(tenantId, integrationId);
  }

  @Post('sync/prices-stocks')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Синхронизировать цены и остатки в магазине Prom.ua',
    description:
      'Считывает товары из базы Limansoft и отправляет пакеты обновлений цен и остатков в API Prom.ua. ' +
      'При async=true задача ставится в фоновую очередь BullMQ (sync-stock).',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description:
      'Ограничить количество обрабатываемых товаров (для тестирования)',
    example: 50,
  })
  @ApiQuery({
    name: 'async',
    required: false,
    description: 'Выполнить асинхронно через очередь BullMQ с отслеживанием прогресса',
    example: true,
  })
  @ApiQuery({
    name: 'integrationId',
    required: false,
    description: 'Идентификатор конкретной интеграции Prom.ua (UUID)',
  })
  @ApiResponse({ status: 202, description: 'Синхронизация завершена или поставлена в очередь' })
  async syncPricesStocks(
    @Param('tenantId') tenantId: string,
    @Query('limit') limitStr?: string,
    @Query('async') isAsync?: string,
    @Query('integrationId') integrationId?: string,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    if ((isAsync === 'true' || isAsync === '1') && this.queueSyncService) {
      return this.queueSyncService.triggerStockSync(tenantId, 'prom', {
        integrationId,
        limit,
      });
    }

    const result = await this.promSyncService.syncPricesAndStocks(tenant, {
      limit,
      integrationId,
    });

    return {
      tenantId,
      ...result,
    };
  }

  @Get('orders')
  @ApiOperation({
    summary: 'Получить список заказов из Prom.ua',
    description: 'Возвращает заказы из Prom.ua для отслеживания и сверки.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'status', required: false, example: 'pending' })
  async getOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
  ) {
    const token = await this.getPromToken(tenantId);
    const orders = await this.promApiClient.getOrders(token, { status });
    return {
      tenantId,
      count: orders.length,
      orders,
    };
  }

  @Post('sync/orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Опрос новых заказов Prom.ua и списание остатков (Polling для магазинов Prom.ua)',
    description:
      'Запрашивает новые заказы через API Prom.ua. Для каждого нового заказа с дедупликацией ' +
      'уменьшает остаток товаров или создает резерв/накладную в Limansoft в зависимости от настроек тенанта.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'status', required: false, example: 'pending' })
  @ApiQuery({ name: 'date_from', required: false, example: '2026-09-01' })
  async syncOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('date_from') dateFrom?: string,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const result = await this.promSyncService.syncOrders(tenant, {
      status,
      dateFrom,
    });

    return {
      success: true,
      tenantId,
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('import/catalog')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Запустить обратный импорт каталога товаров из Prom.ua в Limansoft (MariaDB)',
    description:
      'Помещает задачу в фоновую очередь BullMQ (import-prom-catalog). ' +
      'Поддерживает безопасный режим "only_new" (только новинки) и режим перезаписи "overwrite".',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['only_new', 'overwrite'],
          default: 'only_new',
          description: 'Режим импорта: только новинки или полная перезапись',
        },
        updatePrices: { type: 'boolean', default: true },
        updateStock: { type: 'boolean', default: true },
        updateImages: { type: 'boolean', default: true },
        createBackup: { type: 'boolean', default: true },
        limit: { type: 'number', example: 50 },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'Задача импорта поставлена в очередь BullMQ' })
  async triggerCatalogImport(
    @Param('tenantId') tenantId: string,
    @Body() body: any = {},
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.promApiKey) {
      throw new HttpException(
        'У тенанта не настроен токен Prom.ua (promApiKey)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.importCatalogQueue) {
      throw new HttpException(
        'Очередь импорта каталога Prom.ua недоступна',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const job = await this.importCatalogQueue.add(
      'import-prom-catalog-job',
      {
        tenantId,
        integrationId: body.integrationId,
        mode: body.mode || 'only_new',
        updatePrices: body.updatePrices !== false,
        updateStock: body.updateStock !== false,
        updateImages: body.updateImages !== false,
        createBackup: body.createBackup !== false,
        limit: body.limit ? parseInt(body.limit, 10) : undefined,
      },
      {
        attempts: 2,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return {
      success: true,
      message: 'Задача импорта каталога Prom.ua успешно поставлена в фоновую очередь BullMQ',
      jobId: job.id,
      queue: QUEUE_NAMES.IMPORT_PROM_CATALOG,
      tenantId,
      mode: body.mode || 'only_new',
    };
  }

  @Post('export/catalog')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Запустить прямой экспорт каталога Limansoft в Prom.ua',
    description:
      'Помещает задачу в фоновую очередь BullMQ (export-prom-catalog). ' +
      'Поддерживает режимы "full_overwrite", "only_new" и "update_existing", а также выбор состава полей.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['full_overwrite', 'only_new', 'update_existing'],
          default: 'full_overwrite',
          description: 'Режим экспорта: вся база, только новинки или обновление существующих',
        },
        exportPrices: { type: 'boolean', default: true },
        exportStock: { type: 'boolean', default: true },
        exportDescriptions: { type: 'boolean', default: true },
        exportImages: { type: 'boolean', default: true },
        exportCategories: { type: 'boolean', default: true },
        defaultGroupId: {
          type: 'number',
          example: 123456,
          description: 'ID целевой группы Prom.ua по умолчанию для новых товаров',
        },
        currency: {
          type: 'string',
          example: 'UAH',
          default: 'UAH',
          description: 'Валюта для экспорта (по умолчанию UAH)',
        },
        limit: { type: 'number', example: 50 },
        integrationId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'Задача экспорта поставлена в очередь BullMQ' })
  async triggerCatalogExport(
    @Param('tenantId') tenantId: string,
    @Body() body: any = {},
    @Req() req?: Request,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.promApiKey) {
      throw new HttpException(
        'У тенанта не настроен токен Prom.ua (promApiKey)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.exportCatalogQueue) {
      throw new HttpException(
        'Очередь экспорта каталога в Prom.ua недоступна',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const reqBaseUrl = req ? `${req.protocol}://${req.get('host')}` : undefined;
    const resolvedBaseUrl =
      body.baseUrl ||
      tenant.publicBaseUrl ||
      this.configService?.get<string>('publicBaseUrl') ||
      process.env.PUBLIC_BASE_URL ||
      reqBaseUrl;

    const job = await this.exportCatalogQueue.add(
      'export-prom-catalog-job',
      {
        tenantId,
        integrationId: body.integrationId,
        mode: body.mode || 'full_overwrite',
        exportPrices: body.exportPrices !== false,
        exportStock: body.exportStock !== false,
        exportDescriptions: body.exportDescriptions !== false,
        exportImages: body.exportImages !== false,
        exportCategories: body.exportCategories !== false,
        defaultGroupId: body.defaultGroupId ? Number(body.defaultGroupId) : undefined,
        currency: body.currency?.trim() || undefined,
        baseUrl: resolvedBaseUrl,
        limit: body.limit ? parseInt(body.limit, 10) : undefined,
      },
      {
        attempts: 2,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return {
      success: true,
      message: 'Задача экспорта каталога в Prom.ua успешно поставлена в фоновую очередь BullMQ',
      jobId: job.id,
      queue: QUEUE_NAMES.EXPORT_PROM_CATALOG,
      tenantId,
      mode: body.mode || 'full_overwrite',
    };
  }

  @Get('export/categories')
  @ApiOperation({
    summary: 'Получить группы (категории) Prom.ua для выбора целевой группы при экспорте',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  async getExportCategories(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.promApiKey) {
      throw new HttpException(
        'У тенанта не настроен токен Prom.ua (promApiKey)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const groups = await this.promSyncService.getGroups(tenant);
    return {
      success: true,
      categories: groups.map((g) => ({
        id: g.id,
        name: g.name,
        parentId: g.parent_group_id,
      })),
    };
  }

  @Get('products')
  @ApiOperation({
    summary: 'Получить список товаров из магазина Prom.ua',
    description:
      'Возвращает текущие товары из каталога Prom.ua для верификации соответствия.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'last_id', required: false })
  @ApiQuery({ name: 'group_id', required: false })
  async getProducts(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('last_id') lastId?: string,
    @Query('group_id') groupId?: string,
  ) {
    const token = await this.getPromToken(tenantId);
    const products = await this.promApiClient.getProducts(token, {
      limit: limit ? parseInt(limit, 10) : 20,
      last_id: lastId ? parseInt(lastId, 10) : undefined,
      group_id: groupId ? parseInt(groupId, 10) : undefined,
    });
    return {
      tenantId,
      count: products.length,
      products,
    };
  }

  @Post('products/edit-by-prom-id')
  @ApiOperation({
    summary: 'Прямое обновление товаров в Prom.ua по внутреннему Prom ID',
    description:
      'Позволяет точечно обновить цены, остатки или статус товара напрямую по Prom ID.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 3195399849 },
          price: { type: 'number', example: 166.67 },
          quantity_in_stock: { type: 'number', example: 259 },
          presence: { type: 'string', example: 'available' },
        },
        required: ['id'],
      },
    },
  })
  async editByPromId(
    @Param('tenantId') tenantId: string,
    @Body()
    body: Array<{
      id: number;
      price?: number;
      presence?: 'available' | 'not_available' | 'order';
      quantity_in_stock?: number;
      name?: string;
    }>,
  ) {
    const token = await this.getPromToken(tenantId);
    return this.promApiClient.editProductsById(token, body);
  }
}
