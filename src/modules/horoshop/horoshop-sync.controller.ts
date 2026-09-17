import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  ImportHoroshopCatalogJobData,
  ExportHoroshopCatalogJobData,
} from '../queue/queue.constants';
import { SyncService } from '../queue/sync.service';
import { HoroshopApiClient } from './horoshop-api.client';
import { HoroshopSyncService } from './horoshop-sync.service';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Horoshop')
@Controller('horoshop/:tenantId')
export class HoroshopSyncController {
  private readonly logger = new Logger(HoroshopSyncController.name);

  constructor(
    private readonly horoshopClient: HoroshopApiClient,
    private readonly syncService: HoroshopSyncService,
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
    @Optional()
    @InjectQueue(QUEUE_NAMES.IMPORT_HOROSHOP_CATALOG)
    private readonly importCatalogQueue?: Queue<ImportHoroshopCatalogJobData>,
    @Optional()
    @InjectQueue(QUEUE_NAMES.EXPORT_HOROSHOP_CATALOG)
    private readonly exportCatalogQueue?: Queue<ExportHoroshopCatalogJobData>,
    @Optional()
    @Inject(forwardRef(() => SyncService))
    private readonly queueSyncService?: SyncService,
  ) {}

  /**
   * Проверка подключения к API Хорошоп
   */
  @Get('ping')
  @ApiOperation({
    summary: 'Проверить подключение к магазину Хорошоп',
    description:
      'Выполняет тестовую аутентификацию через /api/auth/ с использованием horoshopDomain, horoshopLogin и horoshopPassword.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Результат проверки подключения' })
  async ping(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    const result = await this.horoshopClient.ping(tenant);

    // Автоматическое сохранение официального названия магазина Хорошоп (TASK-26)
    if (
      result.shopTitle &&
      (!tenant.horoshopShopTitle || tenant.horoshopShopTitle !== result.shopTitle)
    ) {
      try {
        await this.tenantService.update(tenantId, {
          horoshopShopTitle: result.shopTitle,
        });
      } catch (err: any) {
        this.logger.warn(
          `Не удалось обновить horoshopShopTitle для ${tenantId}: ${err.message}`,
        );
      }
    }

    return { tenantId, ...result };
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Получить журнал активности и событий интеграции с Хорошоп',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Список последних событий' })
  getActivity(@Param('tenantId') tenantId: string) {
    return this.syncService.getActivities(tenantId);
  }

  @Get('mappings/stats')
  @ApiOperation({
    summary: 'Получить статистику сопоставления товаров (product_mappings)',
    description:
      'Возвращает количество связанных (synced), ошибочных (error) и общее число товаров для витрины Хорошоп.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'integrationId', required: false })
  async getMappingStats(
    @Param('tenantId') tenantId: string,
    @Query('integrationId') integrationId?: string,
  ) {
    return this.syncService.getMappingStats(tenantId, integrationId);
  }

  /**
   * Ручной запуск синхронизации цен и остатков → Horoshop API
   */
  @Post('sync/prices-stocks')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Синхронизировать цены и остатки в магазине Хорошоп',
    description:
      'Считывает товары из базы Limansoft и отправляет пакеты обновлений цен и остатков в API Хорошоп. ' +
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
    description: 'Идентификатор конкретной интеграции Хорошоп (UUID)',
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

    // Если запрошен асинхронный режим через BullMQ
    if ((isAsync === 'true' || isAsync === '1') && this.queueSyncService) {
      return this.queueSyncService.triggerStockSync(tenantId, 'horoshop', {
        integrationId,
        limit,
      });
    }

    const result = await this.syncService.syncPricesAndStocks(tenant, {
      limit,
      integrationId,
    });

    return {
      success: true,
      tenantId,
      target: tenant.horoshopDomain,
      ...result,
    };
  }

  /**
   * Получить список заказов из Хорошоп
   */
  @Get('orders')
  @ApiOperation({
    summary: 'Получить список заказов из Хорошоп',
    description:
      'Запрашивает список заказов через /api/orders/get/ магазина Хорошоп.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'status', required: false, example: 'new' })
  @ApiQuery({ name: 'date_from', required: false, example: '2026-09-01' })
  async getOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('date_from') dateFrom?: string,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    return this.horoshopClient.getOrders(tenant, {
      status,
      date_from: dateFrom,
    });
  }

  /**
   * Опрос новых заказов из Хорошоп (Polling) с автоматическим списанием остатков в Limansoft
   */
  @Post('sync/orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Опрос новых заказов Хорошоп и списание остатков (Polling для тарифов без вебхуков)',
    description:
      'Запрашивает новые заказы через /api/orders/get/ Хорошоп. Для каждого нового заказа с дедупликацией ' +
      'уменьшает остаток товаров в базе данных Limansoft (name2ost). Заказы, списанные ранее, повторно не списываются.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'status', required: false, example: 'new' })
  @ApiQuery({ name: 'date_from', required: false, example: '2026-09-01' })
  async syncOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('date_from') dateFrom?: string,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const result = await this.syncService.syncOrders(tenant, {
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

  /**
   * Вебхук входящего заказа из Хорошоп (авто-списание остатков)
   */
  @Post('webhook/order')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вебхук заказа из Хорошоп (автоматическое списание остатка)',
    description:
      'Принимает уведомление об оформлении заказа в Хорошоп. Для каждого товара по артикулу (article = tcod) ' +
      'уменьшает складской остаток в таблице name2ost базы данных Limansoft.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', example: 10421 },
        products: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              article: {
                type: 'string',
                example: '251',
                description: 'tcod товара в Limansoft',
              },
              quantity: { type: 'number', example: 1 },
              price: { type: 'number', example: 150 },
            },
          },
        },
      },
    },
  })
  async handleOrderWebhook(
    @Param('tenantId') tenantId: string,
    @Body() payload: any,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);

    const orderId = payload?.order_id || payload?.id || 'N/A';
    this.logger.log(`🛒 [${tenantId}] Вебхук заказа Хорошоп №${orderId}`);

    // Проверяем активность вебхука списания остатков
    if (tenant.horoshopOrderWebhookEnabled === false) {
      this.logger.log(
        `⏸️ [${tenantId}] Вебхук заказа №${orderId} пропущен: авто-списание отключено в настройках тенанта`,
      );
      return {
        success: false,
        disabled: true,
        orderId,
        message: 'Автоматическое списание по вебхуку заказов отключено в настройках тенанта',
        processedItems: [],
        timestamp: new Date().toISOString(),
      };
    }

    // Проверяем дедупликацию, если ID известен
    if (
      orderId !== 'N/A' &&
      !this.syncService.markOrderProcessed(tenantId, orderId)
    ) {
      this.logger.log(
        `⏭️ [${tenantId}] Вебхук: заказ №${orderId} уже был списан ранее.`,
      );
      return {
        success: true,
        orderId,
        message: 'Заказ уже был обработан ранее, повторное списание пропущено',
        processedItems: [],
        timestamp: new Date().toISOString(),
      };
    }

    const results: Array<{
      tcod: number;
      requestedQty: number;
      oldStock: number;
      newStock: number;
    }> = [];

    // Извлекаем позиции заказа: payload может содержать products, items, или line_items
    const lineItems: any[] =
      payload?.products || payload?.items || payload?.line_items || [];

    for (const item of lineItems) {
      // Артикул = tcod
      const articleStr = item.article || item.vendorCode || item.sku;
      const tcod = parseInt(String(articleStr || ''), 10);
      const qty = Number(item.quantity || item.amount || item.count || 1);

      if (!isNaN(tcod) && tcod > 0 && qty > 0) {
        try {
          const deduction = await this.limanService.deductStock(
            tenant,
            tcod,
            qty,
          );

          results.push({
            tcod,
            requestedQty: qty,
            oldStock: deduction.oldStock,
            newStock: deduction.newStock,
          });
        } catch (err: any) {
          this.logger.error(
            `❌ [${tenantId}] Не удалось списать остаток tcod=${tcod}:`,
            err.message,
          );
        }
      }
    }

    return {
      success: true,
      orderId,
      source: 'horoshop',
      processedItems: results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Вебхук создания / обновления товара в Хорошоп
   */
  @Post('webhook/product')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вебхук создания/обновления товара (Хорошоп ↔ Limansoft)',
    description:
      'Принимает уведомление о создании или обновлении товара в магазине Хорошоп.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  async handleProductWebhook(
    @Param('tenantId') tenantId: string,
    @Body() payload: any,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);

    if (tenant.horoshopProductCreationWebhookEnabled === false) {
      this.logger.log(
        `⏸️ [${tenantId}] Вебхук товара пропущен: вебхук создания товаров отключен в настройках тенанта`,
      );
      return {
        success: false,
        disabled: true,
        message: 'Вебхук создания товаров отключен в настройках тенанта',
        timestamp: new Date().toISOString(),
      };
    }

    const article = payload?.article || payload?.sku || payload?.product?.article || 'N/A';
    const title = payload?.title || payload?.name || payload?.product?.title || 'Новый товар';

    this.logger.log(`📦 [${tenantId}] Вебхук создания товара: "${title}" (артикул: ${article})`);

    this.syncService.addActivity(tenantId, {
      type: 'sync',
      status: 'success',
      titleRu: `Вебхук товара: "${title}" (арт: ${article}) успешно обработан`,
      titleUk: `Вебхук товару: "${title}" (арт: ${article}) успішно оброблено`,
      detailsRu: `Создание/обновление товара через входящий вебхук Хорошоп`,
      detailsUk: `Створення/оновлення товару через вхідний вебхук Хорошоп`,
    });

    return {
      success: true,
      article,
      title,
      message: `Товар "${title}" успешно зарегистрирован через вебхук`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Запуск обратного импорта каталога из Хорошоп в Limansoft MariaDB (TASK-22)
   */
  @Post('import/catalog')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Запустить обратный импорт каталога товаров из Хорошоп в Limansoft (MariaDB)',
    description:
      'Помещает задачу в фоновую очередь BullMQ (import-horoshop-catalog). ' +
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
    if (!tenant.horoshopDomain) {
      throw new HttpException(
        'У тенанта не настроен домен магазина Хорошоп (horoshopDomain)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.importCatalogQueue) {
      throw new HttpException(
        'Очередь импорта каталога Хорошоп недоступна',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const job = await this.importCatalogQueue.add(
      'import-horoshop-catalog-job',
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
      message: 'Задача импорта каталога успешно поставлена в фоновую очередь BullMQ',
      jobId: job.id,
      queue: QUEUE_NAMES.IMPORT_HOROSHOP_CATALOG,
      tenantId,
      mode: body.mode || 'only_new',
    };
  }

  /**
   * Запуск прямого экспорта каталога Limansoft → Хорошоп через фоновую очередь BullMQ (TASK-26)
   */
  @Post('export/catalog')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Запустить прямой экспорт каталога Limansoft в Хорошоп',
    description:
      'Помещает задачу в фоновую очередь BullMQ (export-horoshop-catalog). ' +
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
        limit: { type: 'number', example: 50 },
        integrationId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'Задача экспорта поставлена в очередь BullMQ' })
  async triggerCatalogExport(
    @Param('tenantId') tenantId: string,
    @Body() body: any = {},
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.horoshopDomain) {
      throw new HttpException(
        'У тенанта не настроен домен магазина Хорошоп (horoshopDomain)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.exportCatalogQueue) {
      throw new HttpException(
        'Очередь экспорта каталога в Хорошоп недоступна',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const job = await this.exportCatalogQueue.add(
      'export-horoshop-catalog-job',
      {
        tenantId,
        integrationId: body.integrationId,
        mode: body.mode || 'full_overwrite',
        exportPrices: body.exportPrices !== false,
        exportStock: body.exportStock !== false,
        exportDescriptions: body.exportDescriptions !== false,
        exportImages: body.exportImages !== false,
        exportCategories: body.exportCategories !== false,
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
      message: 'Задача экспорта каталога в Хорошоп успешно поставлена в фоновую очередь BullMQ',
      jobId: job.id,
      queue: QUEUE_NAMES.EXPORT_HOROSHOP_CATALOG,
      tenantId,
      mode: body.mode || 'full_overwrite',
    };
  }
}

