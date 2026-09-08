import { Injectable, Logger, Optional } from '@nestjs/common';
import { LimanService } from '../liman/liman.service';
import { Tenant } from '../tenant/tenant.entity';
import { HoroshopApiClient, HoroshopStockPriceItem } from './horoshop-api.client';
import { TenantService } from '../tenant/tenant.service';
import { AlertService } from '../alert/alert.service';

@Injectable()
export class HoroshopSyncService {
  private readonly logger = new Logger(HoroshopSyncService.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly horoshopClient: HoroshopApiClient,
    private readonly tenantService: TenantService,
    @Optional() private readonly alertService?: AlertService,
  ) {}

  /**
   * Пакетная синхронизация цен и остатков из Limansoft в Хорошоп
   */
  async syncPricesAndStocks(
    tenant: Tenant,
    options: { batchSize?: number; limit?: number } = {},
  ): Promise<{
    processed: number;
    updated: number;
    batches: number;
    errors: string[];
    durationMs: number;
  }> {
    const startTime = Date.now();
    const batchSize = options.batchSize || 100;
    const errors: string[] = [];

    this.logger.log(`🚀 [${tenant.id}] Начало синхронизации остатков и цен в Хорошоп...`);

    let page = 1;
    let processed = 0;
    let updated = 0;
    let batches = 0;

    while (true) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: batchSize,
      });

      if (!items || items.length === 0) {
        break;
      }

      const syncItems: HoroshopStockPriceItem[] = items.map((product) => ({
        article: String(product.tcod),
        price: product.price,
        stock: product.stock,
        presence: product.stock > 0,
      }));

      try {
        await this.horoshopClient.updateStocksAndPrices(tenant, syncItems);
        updated += syncItems.length;
      } catch (err: any) {
        const msg = `Ошибка обновления пакета #${batches + 1}: ${err.message}`;
        this.logger.error(`[${tenant.id}] ${msg}`);
        errors.push(msg);

        void this.alertService?.sendCritical(
          'horoshop',
          `Сбой обновления остатков Хорошоп [${tenant.id}]`,
          `Ошибка при обновлении пакета #${batches + 1} в Хорошоп: ${err.message}`,
          err.stack,
          tenant.id,
          { batchIndex: batches + 1, itemsCount: syncItems.length },
        );
      }

      processed += items.length;
      batches++;

      if (options.limit && processed >= options.limit) {
        break;
      }

      if (items.length < batchSize) {
        break;
      }

      page++;
    }

    // Фиксируем дату последней синхронизации
    await this.tenantService.update(tenant.id, {
      lastSyncAt: new Date(),
    });

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `🏁 [${tenant.id}] Синхронизация с Хорошоп завершена за ${durationMs}ms: ` +
        `обработано ${processed}, обновлено ${updated}, пакетов ${batches}, ошибок ${errors.length}`,
    );

    return {
      processed,
      updated,
      batches,
      errors,
      durationMs,
    };
  }

  // Кэш обработанных заказов (ключ: "tenantId:orderId") для предотвращения повторных списаний
  private readonly processedOrderIds = new Set<string>();

  /**
   * Проверить и пометить заказ как обработанный
   * @returns true если заказ новый, false если уже был обработан
   */
  markOrderProcessed(tenantId: string, orderId: string | number): boolean {
    const key = `${tenantId}:${orderId}`;
    if (this.processedOrderIds.has(key)) {
      return false;
    }
    this.processedOrderIds.add(key);
    return true;
  }

  /**
   * Опрос новых заказов из Хорошоп (Polling) с автоматическим списанием складских остатков
   * Используется клиентами, у которых на тарифе Хорошоп нет вебхуков.
   */
  async syncOrders(
    tenant: Tenant,
    options: { status?: string; dateFrom?: string; limit?: number } = {},
  ): Promise<{
    totalFetched: number;
    processedOrders: number;
    skippedOrders: number;
    itemsDeducted: Array<{
      orderId: string | number;
      tcod: number;
      qty: number;
      oldStock: number;
      newStock: number;
    }>;
  }> {
    const statusFilter = options.status || 'new';
    this.logger.log(`📥 [${tenant.id}] Опрос заказов Хорошоп (статус: ${statusFilter})...`);

    const ordersResponse = await this.horoshopClient.getOrders(tenant, {
      status: statusFilter,
      date_from: options.dateFrom,
      limit: options.limit || 50,
    });

    const ordersList: any[] =
      ordersResponse?.response?.orders || ordersResponse?.orders || [];

    let processedOrders = 0;
    let skippedOrders = 0;
    const itemsDeducted: Array<{
      orderId: string | number;
      tcod: number;
      qty: number;
      oldStock: number;
      newStock: number;
    }> = [];

    for (const order of ordersList) {
      const orderId = order.id || order.order_id;
      if (!orderId) continue;

      if (!this.markOrderProcessed(tenant.id, orderId)) {
        this.logger.log(`⏭️ [${tenant.id}] Заказ №${orderId} уже был списан ранее. Пропускаем.`);
        skippedOrders++;
        continue;
      }

      const products: any[] = order.products || order.items || [];
      for (const item of products) {
        const articleStr = item.article || item.vendorCode || item.sku;
        const tcod = parseInt(String(articleStr || ''), 10);
        const qty = Number(item.quantity || item.amount || 1);

        if (!isNaN(tcod) && tcod > 0 && qty > 0) {
          try {
            const deduction = await this.limanService.deductStock(tenant, tcod, qty);

            itemsDeducted.push({
              orderId,
              tcod,
              qty,
              oldStock: deduction.oldStock,
              newStock: deduction.newStock,
            });
          } catch (err: any) {
            this.logger.error(
              `❌ [${tenant.id}] Ошибка списания остатка для заказа №${orderId} (tcod=${tcod}):`,
              err.message,
            );

            void this.alertService?.sendCritical(
              'horoshop',
              `Ошибка списания остатка Хорошоп [${tenant.id}]`,
              `Не удалось списать ${qty} шт. для товара tcod=${tcod} по заказу №${orderId}: ${err.message}`,
              err.stack,
              tenant.id,
              { orderId, tcod, qty },
            );
          }
        }
      }

      processedOrders++;
    }

    this.logger.log(
      `✅ [${tenant.id}] Опрос заказов завершен: получено ${ordersList.length}, ` +
        `обработано ${processedOrders}, пропущено (дубли) ${skippedOrders}, списано позиций ${itemsDeducted.length}`,
    );

    return {
      totalFetched: ordersList.length,
      processedOrders,
      skippedOrders,
      itemsDeducted,
    };
  }
}
