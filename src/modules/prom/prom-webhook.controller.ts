import { Controller, Post, Param, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Prom.ua')
@Controller('prom/:tenantId/webhook')
export class PromWebhookController {
  private readonly logger = new Logger(PromWebhookController.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
  ) {}

  @Post('order')
  @Public()
  @ApiOperation({
    summary: 'Вебхук приема заказов из Prom.ua (автоматическое списание остатка)',
    description:
      'Получает состав заказа из Prom.ua, уменьшает остаток в name2ost и фиксирует источник "prom.ua".',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', example: 987654 },
        client_notes: { type: 'string', example: 'Доставка Нова Пошта №12' },
        products: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              external_id: { type: 'string', example: '251' },
              name: { type: 'string', example: 'Burn 0.25 Original' },
              quantity: { type: 'number', example: 2 },
              price: { type: 'number', example: 47 },
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
      `🛒 [${tenantId}] Получен вебхук заказа №${payload?.order_id ?? 'N/A'} из Prom.ua: ${payload?.products?.length ?? 0} позиций`,
    );

    const results: Array<{ tcod: number; requestedQty: number; oldStock: number; newStock: number }> = [];

    if (Array.isArray(payload?.products)) {
      for (const prod of payload.products) {
        const tcod = parseInt(prod.external_id, 10);
        const qty = Number(prod.quantity ?? 1);

        if (!isNaN(tcod) && qty > 0) {
          try {
            const deduction = await this.limanService.deductStock(tenant, tcod, qty);
            results.push({
              tcod,
              requestedQty: qty,
              oldStock: deduction.oldStock,
              newStock: deduction.newStock,
            });
          } catch (err) {
            this.logger.error(`Не удалось списать остаток для tcod=${tcod}:`, err);
          }
        }
      }
    }

    return {
      success: true,
      orderId: payload?.order_id,
      source: 'prom.ua',
      processedItems: results,
      timestamp: new Date().toISOString(),
    };
  }
}
