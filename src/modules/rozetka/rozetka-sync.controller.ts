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
   * Проверка подключения к Rozetka Seller API
   */
  @Get('ping')
  @ApiOperation({
    summary: 'Проверить подключение к Rozetka Seller API',
    description:
      'Авторизуется в Rozetka Seller API и возвращает список зарегистрированных магазинов. ' +
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
   * Ручной запуск синхронизации цен и остатков → Rozetka Seller API
   */
  @Post('sync/prices-stocks')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Синхронизировать цены и остатки в Rozetka Seller API',
    description:
      'Считывает все товары из Limansoft и отправляет обновления цен и остатков в Rozetka Seller API ' +
      'батчами по 100 товаров. Требует настройки Rozetka credentials в тенанте.',
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
   * Webhook приёма заказов от Rozetka
   */
  @Post('webhook/order')
  @ApiOperation({
    summary: 'Webhook новых заказов от Rozetka (автоматическое списание остатка)',
    description:
      'Принимает уведомления о заказах от Rozetka Seller API. ' +
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
    @Body() payload: any,
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

    const lineItems: Array<{ article?: string; quantity?: number }> =
      payload?.items ?? payload?.products ?? [];

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
