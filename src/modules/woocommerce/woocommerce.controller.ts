import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Req,
  Res,
  Logger,
  HttpCode,
  HttpStatus,
  Optional,
  NotFoundException,
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
import type { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { WoocommerceSyncService } from './woocommerce-sync.service';
import { WoocommerceApiClient } from './woocommerce-api.client';
import { WoocommerceImportService } from './woocommerce-import.service';
import { TenantService } from '../tenant/tenant.service';
import { LimanService } from '../liman/liman.service';
import { LimanOrderService } from '../liman/liman-order.service';
import { ProductMappingService } from '../tenant/product-mapping.service';
import { Public } from '../../common/decorators/public.decorator';
import { AlertService } from '../alert/alert.service';
import { QUEUE_NAMES, ImportWooCatalogJobData } from '../queue/queue.constants';

@ApiTags('WooCommerce')
@Controller('woocommerce/:tenantId')
export class WoocommerceController {
  private readonly logger = new Logger(WoocommerceController.name);

  constructor(
    private readonly syncService: WoocommerceSyncService,
    private readonly wooClient: WoocommerceApiClient,
    private readonly importService: WoocommerceImportService,
    private readonly tenantService: TenantService,
    private readonly limanService: LimanService,
    @InjectQueue(QUEUE_NAMES.IMPORT_WOO_CATALOG)
    private readonly wooImportQueue: Queue<ImportWooCatalogJobData>,
    private readonly limanOrderService: LimanOrderService,
    @Optional() private readonly alertService?: AlertService,
    @Optional() private readonly productMappingService?: ProductMappingService,
  ) {}

  @Get('ping')
  @ApiOperation({
    summary: 'Проверить подключение к WooCommerce магазину тенанта',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  async ping(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    return this.wooClient.testConnection(tenant);
  }

  @Get('plugin/download')
  @Public()
  @ApiOperation({
    summary: 'Скачать скомпилированный WordPress-плагин Limansoft Sync (.zip)',
    description: 'Отдает архив limansoft-sync-woocommerce.zip для быстрой установки в WordPress.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  async downloadPlugin(@Param('tenantId') tenantId: string, @Res() res: Response) {
    const pluginPath = path.resolve(process.cwd(), 'packages/dist/limansoft-sync-woocommerce.zip');
    if (!fs.existsSync(pluginPath)) {
      throw new NotFoundException('Файл плагина limansoft-sync-woocommerce.zip не найден на сервере');
    }
    return res.download(pluginPath, 'limansoft-sync-woocommerce.zip');
  }

  @Get('sync/status')
  @ApiOperation({
    summary: 'Получить текущий статус и прогресс синхронизации каталога',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  getSyncStatus(@Param('tenantId') tenantId: string) {
    return this.syncService.getSyncStatus(tenantId);
  }

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Запустить синхронизацию каталога Limansoft → WooCommerce',
    description:
      'Выгружает активные товары из Limansoft в WooCommerce пакетами по 50 шт. Для полного каталога выполняется в фоне без блокировки.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description:
      'Ограничить количество выгружаемых товаров (например, 10 или 50 для проверки).',
    example: 50,
  })
  @ApiQuery({
    name: 'async',
    required: false,
    description:
      'Запустить асинхронно в фоне (по умолчанию true для полного каталога)',
    example: 'true',
  })
  @ApiQuery({
    name: 'imageBaseUrl',
    required: false,
    description:
      'Базовый URL для ссылок на изображения (переопределяет авто-определение из request.host). Нужен если WooCommerce в Docker и API на хосте.',
    example: 'http://172.20.0.1:3000',
  })
  @ApiResponse({ status: 202, description: 'Синхронизация запущена' })
  async syncCatalog(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit: string | undefined,
    @Query('async') asyncParam: string | undefined,
    @Query('imageBaseUrl') imageBaseUrl: string | undefined,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const baseUrl = imageBaseUrl ?? `${req.protocol}://${req.get('host')}`;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const isAsync =
      asyncParam === 'false' ? false : !limitNum || limitNum > 100;

    if (isAsync) {
      // Фоновый запуск: не подвешивает HTTP-соединение WordPress / cURL
      setImmediate(async () => {
        try {
          await this.syncService.syncFullCatalog(tenant, baseUrl, {
            limit: limitNum,
          });
        } catch (err) {
          this.logger.error(
            `❌ [${tenantId}] Сбой фоновой синхронизации в WooCommerce:`,
            err,
          );
        }
      });

      return {
        success: true,
        tenantId,
        target: tenant.woocommerceUrl,
        imageBaseUrl: baseUrl,
        message:
          'Синхронізація повного каталогу успішно запущена у фоновому режимі',
        async: true,
      };
    }

    const result = await this.syncService.syncFullCatalog(tenant, baseUrl, {
      limit: limitNum,
    });

    return {
      success: true,
      tenantId,
      target: tenant.woocommerceUrl,
      imageBaseUrl: baseUrl,
      ...result,
    };
  }

  @Post('sync/stock')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Синхронизировать только цены и остатки в WooCommerce',
    description:
      'Быстрое обновление stock_quantity и regular_price без полного пересоздания товаров.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  async syncStock(@Param('tenantId') tenantId: string, @Req() req: Request) {
    const tenant = await this.tenantService.findOne(tenantId);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await this.syncService.syncStockAndPrices(tenant, baseUrl);

    return {
      success: true,
      tenantId,
      target: tenant.woocommerceUrl,
      ...result,
    };
  }

  @Post('webhook/order')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Вебхук: приём заказа из WooCommerce → авто-списание остатка в Limansoft через LimanOrderService',
    description:
      'Плагин WooCommerce отправляет этот запрос при оформлении заказа. ' +
      'Для каждой позиции резолвирует артикул/SKU в tcod Limansoft (через product_mappings, tcod, nnom, strihcod) ' +
      'и уменьшает складской остаток в таблице name2ost (Режим 1) либо создает черновик накладной tip_dok:85 (Режим 2).',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', example: 12345 },
        status: { type: 'string', example: 'processing' },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'number', example: 1042 },
              sku: { type: 'string', example: 'ELE-23-0557' },
              name: { type: 'string', example: 'iPhone 13' },
              quantity: { type: 'number', example: 1 },
              price: { type: 'string', example: '35000' },
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
    const orderId = payload?.id || payload?.order_id || 'N/A';

    this.logger.log(`🛒 [${tenantId}] Вебхук заказа WooCommerce №${orderId}`);

    // Проверяем активность вебхука списания остатков
    if (tenant.woocommerceOrderWebhookEnabled === false) {
      this.logger.log(
        `⏸️ [${tenantId}] Вебхук заказа WooCommerce №${orderId} пропущен: авто-списание отключено в настройках тенанта`,
      );
      return {
        success: false,
        disabled: true,
        orderId,
        message:
          'Автоматическое списание по вебхуку заказов WooCommerce отключено в настройках тенанта',
        processedItems: [],
        timestamp: new Date().toISOString(),
      };
    }

    // Дедупликация
    if (
      orderId !== 'N/A' &&
      !this.limanOrderService.markOrderProcessed(
        tenantId,
        'woocommerce',
        String(orderId),
      )
    ) {
      this.logger.log(
        `⏭️ [${tenantId}] Вебхук: заказ WooCommerce №${orderId} уже был обработан ранее.`,
      );
      return {
        success: true,
        orderId,
        message: 'Заказ уже был обработан ранее, повторное списание пропущено',
        processedItems: [],
        timestamp: new Date().toISOString(),
      };
    }

    // Маппинг payload WooCommerce -> UnifiedIncomingOrderDto
    const dto = this.syncService.mapWooOrderToUnifiedDto(payload);

    // Получаем интеграцию для product_mappings
    const integration = await this.syncService.resolveIntegration(tenantId);

    const result = await this.limanOrderService.processIncomingOrder(
      tenant,
      dto,
      integration?.id || null,
    );

    return {
      success: result.success,
      orderId,
      source: 'woocommerce',
      mode: result.mode,
      processedItems: result.deductedItems.map((d) => ({
        tcod: d.tcod,
        requestedQty: d.qty,
        oldStock: d.oldStock,
        newStock: d.newStock,
      })),
      skippedArticles: result.skippedArticles,
      warnings: result.warnings,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('orders/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Опрос новых заказов из WooCommerce (Polling) с автоматическим списанием остатков',
    description:
      'Запрашивает список заказов через REST API WooCommerce (по умолчанию статус "processing") ' +
      'и выполняет безопасное списание остатков через LimanOrderService.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Статус заказов WooCommerce (по умолчанию "processing")',
    example: 'processing',
  })
  @ApiQuery({
    name: 'perPage',
    required: false,
    description: 'Количество заказов за один запрос (по умолчанию 50)',
    example: 50,
  })
  async syncOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('perPage') perPage?: string,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const limit = perPage ? parseInt(perPage, 10) : 50;

    const result = await this.syncService.syncOrders(tenant, {
      status: status || 'processing',
      perPage: isNaN(limit) ? 50 : limit,
    });

    return {
      success: true,
      tenantId,
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('import/products')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Запустить пакетный импорт каталога WooCommerce → Limansoft MariaDB (Pull, async)',
    description:
      'Ставит задачу в очередь BullMQ и возвращает jobId немедленно. Для отслеживания прогресса — GET /sync/jobs/import-woo-catalog/:jobId.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Максимальное количество товаров для импорта',
    example: 50,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Начальная страница пагинации WooCommerce (по умолчанию 1)',
    example: 1,
  })
  @ApiResponse({
    status: 202,
    description: 'Задача импорта поставлена в очередь, возвращён jobId',
  })
  async importCatalog(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    // Валидируем тенанта (выбросит 404 если не найден)
    await this.tenantService.findOne(tenantId);

    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const pageNum = page ? parseInt(page, 10) : undefined;

    const job = await this.wooImportQueue.add(
      'import-woo-catalog-job',
      { tenantId, limit: limitNum, page: pageNum },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );

    this.logger.log(
      `📥 [${tenantId}] Задача импорта WooCommerce каталога поставлена в очередь: jobId=${job.id}`,
    );

    return {
      success: true,
      message: 'Задача импорта каталога поставлена в очередь',
      jobId: job.id,
      queue: QUEUE_NAMES.IMPORT_WOO_CATALOG,
      tenantId,
      statusUrl: `/sync/jobs/${QUEUE_NAMES.IMPORT_WOO_CATALOG}/${job.id}`,
    };
  }

  @Post('webhook/product')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Вебхук: приём нового или изменённого товара из WordPress плагина (Push)',
    description:
      'Вызывается плагином limansoft-sync при хуках woocommerce_new_product / woocommerce_update_product. Загружает карточку, скачивает медиа и обновляет MariaDB.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        product_id: { type: 'number', example: 123 },
        event: { type: 'string', example: 'updated' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Товар успешно импортирован' })
  async handleProductWebhook(
    @Param('tenantId') tenantId: string,
    @Body() payload: any,
  ) {
    const productId = Number(payload?.product_id ?? payload?.id);

    if (!productId || isNaN(productId)) {
      return { success: false, message: 'Параметр product_id обязателен' };
    }

    // Fix #5: Безопасный lookup тенанта — возвращаем 200 вместо 500,
    // чтобы WordPress плагин не уходил в бесконечные ретраи.
    let tenant: Awaited<ReturnType<typeof this.tenantService.findOne>>;
    try {
      tenant = await this.tenantService.findOne(tenantId);
    } catch {
      this.logger.warn(
        `⚠️ Вебхук товара #${productId}: тенант "${tenantId}" не найден`,
      );
      return {
        success: false,
        tenantId,
        message: `Тенант "${tenantId}" не найден`,
      };
    }

    this.logger.log(
      `📦 [${tenantId}] Вебхук товара #${productId} (${payload?.event || 'update'}) из WooCommerce`,
    );

    const result = await this.importService.importProductById(
      tenant,
      productId,
    );

    return {
      tenantId,
      ...result,
    };
  }
}
