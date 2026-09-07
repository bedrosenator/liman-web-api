import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { WoocommerceSyncService } from './woocommerce-sync.service';
import { WoocommerceApiClient } from './woocommerce-api.client';
import { TenantService } from '../tenant/tenant.service';
import { LimanService } from '../liman/liman.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('WooCommerce')
@Controller('woocommerce/:tenantId')
export class WoocommerceController {
  private readonly logger = new Logger(WoocommerceController.name);

  constructor(
    private readonly syncService: WoocommerceSyncService,
    private readonly wooClient: WoocommerceApiClient,
    private readonly tenantService: TenantService,
    private readonly limanService: LimanService,
  ) {}

  @Get('ping')
  @ApiOperation({ summary: 'Проверить подключение к WooCommerce магазину тенанта' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  async ping(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    return this.wooClient.testConnection(tenant);
  }

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Запустить полную синхронизацию каталога Limansoft → WooCommerce',
    description:
      'Выгружает все активные товары из Limansoft в WooCommerce пакетами по 50 шт. SKU = tcod.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Ограничить количество выгружаемых товаров (например, 10 или 50 для проверки).',
    example: 50,
  })
  @ApiQuery({
    name: 'imageBaseUrl',
    required: false,
    description: 'Базовый URL для ссылок на изображения (переопределяет авто-определение из request.host). Нужен если WooCommerce в Docker и API на хосте.',
    example: 'http://172.20.0.1:3000',
  })
  @ApiResponse({ status: 202, description: 'Синхронизация запущена и завершена' })
  async syncCatalog(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit: string | undefined,
    @Query('imageBaseUrl') imageBaseUrl: string | undefined,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const baseUrl = imageBaseUrl ?? `${req.protocol}://${req.get('host')}`;
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const result = await this.syncService.syncFullCatalog(tenant, baseUrl, { limit: limitNum });

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
    description: 'Быстрое обновление stock_quantity и regular_price без полного пересоздания товаров.',
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
    summary: 'Вебхук: приём заказа из WooCommerce → мгновенное списание остатка в Limansoft',
    description:
      'Плагин WooCommerce отправляет этот запрос при оформлении заказа. Остатки списываются из name2ost и фиксируется источник "woocommerce".',
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
              product_id: { type: 'number' },
              sku: { type: 'string', example: '251' },
              name: { type: 'string', example: 'Burn 0.25 Original' },
              quantity: { type: 'number', example: 2 },
              price: { type: 'string', example: '47' },
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

    this.logger.log(
      `🛒 [${tenantId}] Вебхук заказа №${payload?.id ?? payload?.order_id} из WooCommerce: ${payload?.line_items?.length ?? 0} позиций`,
    );

    const results: Array<{
      tcod: number;
      productName: string;
      requestedQty: number;
      oldStock: number;
      newStock: number;
    }> = [];

    const lineItems: any[] = payload?.line_items ?? payload?.products ?? [];

    for (const item of lineItems) {
      // SKU в WooCommerce = наш tcod
      const sku = item.sku || item.external_id;
      const qty = Number(item.quantity ?? 1);
      const tcod = parseInt(String(sku), 10);

      if (!isNaN(tcod) && tcod > 0 && qty > 0) {
        try {
          const deduction = await this.limanService.deductStock(tenant, tcod, qty);
          results.push({
            tcod,
            productName: item.name ?? `tcod: ${tcod}`,
            requestedQty: qty,
            oldStock: deduction.oldStock,
            newStock: deduction.newStock,
          });
        } catch (err) {
          this.logger.error(`Не удалось списать остаток для tcod=${tcod}:`, err);
        }
      }
    }

    return {
      success: true,
      orderId: payload?.id ?? payload?.order_id,
      source: 'woocommerce',
      processedItems: results,
      timestamp: new Date().toISOString(),
    };
  }
}
