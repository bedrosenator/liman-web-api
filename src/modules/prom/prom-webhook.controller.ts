import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  Logger,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiHeader } from '@nestjs/swagger';
import { LimanService } from '../liman/liman.service';
import { LimanOrderService } from '../liman/liman-order.service';
import { TenantService } from '../tenant/tenant.service';
import { PromSyncService } from './prom-sync.service';
import { Public } from '../../common/decorators/public.decorator';
import { UnifiedIncomingOrderDto } from '../liman/dto/unified-order.dto';

@ApiTags('Prom.ua')
@Controller('prom/:tenantId/webhook')
export class PromWebhookController {
  private readonly logger = new Logger(PromWebhookController.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly limanOrderService: LimanOrderService,
    private readonly tenantService: TenantService,
    private readonly promSyncService: PromSyncService,
  ) {}

  @Post('order')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Вебхук приема заказов из Prom.ua (автоматическое списание остатка / резерв)',
    description:
      'Получает состав заказа из Prom.ua, резолвирует артикулы/tcod через product_mappings и таблицу товаров Limansoft, ' +
      'и выполняет списание остатка или создание резерва в зависимости от настроек клиента. ' +
      'Если у тенанта задан promWebhookSecret — обязателен заголовок X-Secret-Token.',
  })
  @ApiHeader({
    name: 'X-Secret-Token',
    required: false,
    description: 'Секретный токен для верификации вебхука (если promWebhookSecret настроен у тенанта)',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', example: 987654 },
        client_notes: { type: 'string', example: 'Доставка Нова Пошта №12' },
        client_first_name: { type: 'string', example: 'Иван' },
        client_last_name: { type: 'string', example: 'Иванов' },
        phone: { type: 'string', example: '+380501234567' },
        email: { type: 'string', example: 'client@example.com' },
        delivery_address: { type: 'string', example: 'г. Киев, Отделение №1' },
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
    @Headers('x-secret-token') receivedToken?: string,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const orderId = payload?.order_id || payload?.id || 'N/A';

    this.logger.log(`🛒 [${tenantId}] Получен вебхук заказа Prom.ua №${orderId}`);

    // Верификация секретного токена (если настроен у тенанта)
    if (tenant.promWebhookSecret) {
      if (!receivedToken || receivedToken !== tenant.promWebhookSecret) {
        this.logger.warn(
          `🔒 [${tenantId}] Отклонён вебхук Prom.ua №${orderId}: неверный или отсутствующий X-Secret-Token`,
        );
        throw new UnauthorizedException('Invalid or missing X-Secret-Token');
      }
    }

    // Проверяем активность вебхука списания остатков
    if (tenant.promOrderWebhookEnabled === false) {
      this.logger.log(
        `⏸️ [${tenantId}] Вебхук заказа №${orderId} пропущен: авто-списание Prom отключено в настройках тенанта`,
      );
      return {
        success: false,
        disabled: true,
        orderId,
        message: 'Автоматическое списание по вебхуку заказов Prom отключено в настройках тенанта',
        processedItems: [],
        timestamp: new Date().toISOString(),
      };
    }

    // Дедупликация
    if (
      orderId !== 'N/A' &&
      !this.limanOrderService.markOrderProcessed(tenantId, 'prom', String(orderId))
    ) {
      this.logger.log(
        `⏭️ [${tenantId}] Вебхук Prom: заказ №${orderId} уже был списан ранее.`,
      );
      return {
        success: true,
        orderId,
        message: 'Заказ уже был обработан ранее, повторное списание пропущено',
        processedItems: [],
        timestamp: new Date().toISOString(),
      };
    }

    // Извлекаем позиции заказа
    const lineItemsRaw: any[] =
      payload?.products || payload?.items || payload?.line_items || [];

    const customerName =
      [payload?.client_first_name, payload?.client_second_name, payload?.client_last_name]
        .filter(Boolean)
        .join(' ') ||
      payload?.client_name ||
      payload?.customer_name ||
      undefined;

    // Формируем унифицированное DTO
    const dto: UnifiedIncomingOrderDto = {
      source: 'prom',
      externalOrderId: String(orderId),
      customerName,
      customerPhone: payload?.phone || payload?.client_phone,
      customerEmail: payload?.email || payload?.client_email,
      deliveryAddress: payload?.delivery_address || payload?.delivery?.address,
      deliveryService: payload?.delivery_option?.name || payload?.delivery_provider,
      paymentMethod: payload?.payment_option?.name || payload?.payment_type,
      totalAmount: payload?.full_price || payload?.price ? Number(payload.full_price || payload.price) : undefined,
      currency: 'UAH',
      lineItems: lineItemsRaw
        .map((item: any) => ({
          externalArticle: String(item.external_id || item.sku || item.id || ''),
          name: item.name || item.title,
          quantity: Number(item.quantity || item.count || 1),
          price: Number(item.price || 0),
        }))
        .filter((li) => li.externalArticle && li.quantity > 0),
      rawPayload: payload,
    };

    // Находим активную интеграцию Prom
    const integration = await this.promSyncService.resolveIntegration(tenantId);

    const result = await this.limanOrderService.processIncomingOrder(
      tenant,
      dto,
      integration?.id || null,
    );

    if (result.success && result.deductedItems.length > 0) {
      this.promSyncService.addActivity(tenantId, {
        type: 'order',
        status: 'success',
        titleRu: `Вебхук заказа Prom.ua №${orderId}`,
        titleUk: `Вебхук замовлення Prom.ua №${orderId}`,
        detailsRu: `Обработано ${result.deductedItems.length} позиций в режиме "${result.mode}"`,
        detailsUk: `Оброблено ${result.deductedItems.length} позицій у режимі "${result.mode}"`,
      });
    }

    return {
      success: result.success,
      orderId,
      source: 'prom',
      mode: result.mode,
      processedItems: result.deductedItems.map((d) => ({
        tcod: d.tcod,
        requestedQty: d.qty,
        oldStock: d.oldStock,
        newStock: d.newStock,
      })),
      skippedArticles: result.skippedArticles,
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
      timestamp: new Date().toISOString(),
    };
  }
}
