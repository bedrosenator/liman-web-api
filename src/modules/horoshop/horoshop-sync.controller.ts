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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
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
    return { tenantId, ...result };
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
      'Артикулом (article) является tcod товара.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Ограничить количество обрабатываемых товаров (для тестирования)',
    example: 50,
  })
  @ApiResponse({ status: 202, description: 'Синхронизация завершена' })
  async syncPricesStocks(
    @Param('tenantId') tenantId: string,
    @Query('limit') limitStr?: string,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    const result = await this.syncService.syncPricesAndStocks(tenant, { limit });

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
    description: 'Запрашивает список заказов через /api/orders/get/ магазина Хорошоп.',
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
              article: { type: 'string', example: '251', description: 'tcod товара в Limansoft' },
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

    const results: Array<{
      tcod: number;
      requestedQty: number;
      oldStock: number;
      newStock: number;
    }> = [];

    // Извлекаем позиции заказа: payload может содержать products, items, или line_items
    const lineItems: any[] = payload?.products || payload?.items || payload?.line_items || [];

    for (const item of lineItems) {
      // Артикул = tcod
      const articleStr = item.article || item.vendorCode || item.sku;
      const tcod = parseInt(String(articleStr || ''), 10);
      const qty = Number(item.quantity || item.amount || item.count || 1);

      if (!isNaN(tcod) && tcod > 0 && qty > 0) {
        try {
          const current = await this.limanService.getProductByTcod(tenant, tcod);
          const newStock = Math.max(0, current.stock - qty);
          const updated = await this.limanService.updateStock(tenant, tcod, newStock);

          results.push({
            tcod,
            requestedQty: qty,
            oldStock: updated.oldStock,
            newStock: updated.newStock,
          });
        } catch (err: any) {
          this.logger.error(
            `❌ [${tenantId}] Не удалось обновить остаток tcod=${tcod}:`,
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
}
