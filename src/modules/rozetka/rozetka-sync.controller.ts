import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RozetkaApiClient } from './rozetka-api.client';
import { RozetkaSyncService } from './rozetka-sync.service';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('Rozetka')
@Controller('rozetka/:tenantId')
export class RozetkaSyncController {
  private readonly logger = new Logger(RozetkaSyncController.name);

  constructor(
    private readonly rozetkaClient: RozetkaApiClient,
    private readonly syncService: RozetkaSyncService,
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Проверка подключения к Rozetka Seller API (GET /goods/counts)
   */
  @Get('ping')
  @ApiOperation({
    summary: 'Проверить подключение к Rozetka Seller API',
    description:
      'Авторизуется в Rozetka Seller API (POST /sites с base64-паролем) и запрашивает счётчики товаров (GET /goods/counts). ' +
      'Требует настройки rozetkaClientId и rozetkaClientSecret в тенанте.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Результат проверки подключения' })
  async ping(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    const result = await this.rozetkaClient.ping(tenant);
    return { tenantId, ...result };
  }

  /**
   * Ручной запуск синхронизации цен и остатков → Rozetka Seller API (PUT /items/mass-update)
   */
  @Post('sync/prices-stocks')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Синхронизировать цены и остатки в Rozetka Seller API',
    description:
      'Считывает товары из базы Limansoft и обновляет цены и остатки в Rozetka Seller API ' +
      'батчами по 100 товаров через официальный endpoint PUT /items/mass-update.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 202, description: 'Синхронизация завершена, результат в теле ответа' })
  async syncPricesStocks(
    @Param('tenantId') tenantId: string,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const result = await this.syncService.syncPricesAndStocks(tenant, baseUrl);

    return {
      success: true,
      tenantId,
      ...result,
    };
  }

  /**
   * Запуск синхронизации новых заказов Rozetka (GET /orders/search?status=1)
   */
  @Post('sync/orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Синхронизировать новые заказы из Rozetka Seller API',
    description:
      'Запрашивает новые заказы (status=1) через GET /orders/search, получает детали заказа через GET /orders/{id}, ' +
      'и списывает остатки купленных товаров в базе Limansoft (name2ost).',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Результат обработки заказов' })
  async syncOrders(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    const result = await this.syncService.syncOrders(tenant);
    return {
      success: true,
      tenantId,
      ...result,
    };
  }

  /**
   * Webhook приёма заказов от Rozetka (или эмуляции заказов)
   */
  @Post('webhook/order')
  @ApiOperation({
    summary: 'Webhook новых заказов от Rozetka (автоматическое списание остатка)',
    description:
      'Принимает уведомления о заказах Rozetka. ' +
      'Для каждой позиции заказа уменьшает остаток в name2ost в базе Limansoft.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', example: 123456789 },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              article: {
                type: 'string',
                example: '251',
                description: 'Артикул = tcod из Limansoft (id в фиде)',
              },
              quantity: { type: 'number', example: 2 },
              title: { type: 'string', example: 'Bond Street Blue' },
              price: { type: 'number', example: 142.86 },
            },
          },
        },
      },
    },
  })
  async handleOrderWebhook(
    @Param('tenantId') tenantId: string,
    @Body()
    payload: {
      order_id?: number;
      items?: Array<{ article?: string; quantity?: number; title?: string; price?: number }>;
      products?: Array<{ article?: string; quantity?: number }>;
    },
  ) {
    const tenant = await this.tenantService.findOne(tenantId);

    this.logger.log(
      `🛒 [${tenantId}] Rozetka заказ №${payload?.order_id ?? 'N/A'}: ${payload?.items?.length ?? 0} позиций`,
    );

    const results: Array<{
      tcod: number;
      requestedQty: number;
      oldStock: number;
      newStock: number;
    }> = [];

    const lineItems = payload?.items ?? payload?.products ?? [];

    for (const item of lineItems) {
      // article = tcod в нашем фиде
      const tcod = parseInt(String(item.article ?? ''), 10);
      const qty = Number(item.quantity ?? 1);

      if (!isNaN(tcod) && tcod > 0 && qty > 0) {
        try {
          const deduction = await this.limanService.deductStock(tenant, tcod, qty);
          results.push({
            tcod,
            requestedQty: qty,
            oldStock: deduction.oldStock,
            newStock: deduction.newStock,
          });
        } catch (err) {
          this.logger.error(
            `❌ [${tenantId}] Не удалось списать остаток tcod=${tcod}:`,
            err,
          );
        }
      }
    }

    return {
      success: true,
      orderId: payload?.order_id,
      source: 'rozetka',
      processedItems: results,
      timestamp: new Date().toISOString(),
    };
  }
}
