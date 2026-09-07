import { Injectable, Logger } from '@nestjs/common';
import { LimanService } from '../liman/liman.service';
import {
  RozetkaApiClient,
  RozetkaMassUpdateItem,
  RozetkaOrder,
} from './rozetka-api.client';
import { Tenant } from '../tenant/tenant.entity';

const BATCH_SIZE = 100; // Rozetka mass-update принимает до 500 товаров

export interface RozetkaSyncResult {
  itemsSynced: number;
  errors: number;
  durationMs: number;
}

export interface RozetkaOrderSyncResult {
  ordersProcessed: number;
  itemsDeducted: number;
  errors: number;
  orders: Array<{
    orderId: number;
    items: Array<{ tcod: number; qty: number; oldStock: number; newStock: number }>;
  }>;
}

/**
 * Сервис синхронизации цен, остатков и заказов с Rozetka Seller API v2
 * В соответствии с https://api-seller.rozetka.com.ua/apidoc/
 */
@Injectable()
export class RozetkaSyncService {
  private readonly logger = new Logger(RozetkaSyncService.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly rozetkaClient: RozetkaApiClient,
  ) {}

  /**
   * Синхронизация цен и остатков всего каталога через PUT /items/mass-update
   */
  async syncPricesAndStocks(
    tenant: Tenant,
    baseUrl: string,
  ): Promise<RozetkaSyncResult> {
    const startTime = Date.now();
    const totalCount = await this.limanService.getProductCount(tenant);

    this.logger.log(
      `🔄 [${tenant.id}] Начало синхронизации ${totalCount} товаров в Rozetka Seller API (mass-update)`,
    );

    let itemsSynced = 0;
    let errors = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: BATCH_SIZE,
        baseUrl,
      });

      if (!items.length) {
        hasMore = false;
        break;
      }

      // Формируем пакет UpdatingItem для PUT /items/mass-update
      // item_id = id предложения в фиде = наш tcod
      const massUpdateItems: RozetkaMassUpdateItem[] = items.map((p) => {
        const item: RozetkaMassUpdateItem = {
          item_id: p.tcod,
          stock_quantity: Math.max(0, Math.floor(p.stock)),
        };
        if (p.price > 0) {
          item.price = parseFloat(p.price.toFixed(2));
        }
        return item;
      });

      try {
        const result = await this.rozetkaClient.massUpdateItems(tenant, {
          isIgnoreCheck: false,
          items: massUpdateItems,
        });
        itemsSynced += result.updated;
        errors += result.errorsCount;
      } catch (err) {
        this.logger.error(`❌ [${tenant.id}] Ошибка mass-update (стр. ${page}):`, err);
        errors += massUpdateItems.length;
      }

      page++;
      if (items.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `✅ [${tenant.id}] Rozetka sync завершён за ${durationMs}ms. Товаров обновлено: ${itemsSynced}, Ошибок: ${errors}`,
    );

    return { itemsSynced, errors, durationMs };
  }

  /**
   * Опрос новых заказов в Rozetka Seller API и автоматическое списание остатков
   */
  async syncOrders(tenant: Tenant): Promise<RozetkaOrderSyncResult> {
    this.logger.log(`🛒 [${tenant.id}] Проверка новых заказов Rozetka...`);

    const result: RozetkaOrderSyncResult = {
      ordersProcessed: 0,
      itemsDeducted: 0,
      errors: 0,
      orders: [],
    };

    try {
      // Ищем заказы со статусом 1 (Новые)
      const newOrders = await this.rozetkaClient.searchOrders(tenant, { status: 1 });

      if (!newOrders.length) {
        this.logger.log(`ℹ️ [${tenant.id}] Новых заказов Rozetka не найдено`);
        return result;
      }

      this.logger.log(`📥 [${tenant.id}] Найдено новых заказов: ${newOrders.length}`);

      for (const orderSummary of newOrders) {
        try {
          const orderDetails = await this.rozetkaClient.getOrderDetails(
            tenant,
            orderSummary.id,
          );

          if (!orderDetails || !orderDetails.purchases?.length) {
            continue;
          }

          const deductedList: Array<{
            tcod: number;
            qty: number;
            oldStock: number;
            newStock: number;
          }> = [];

          for (const purchase of orderDetails.purchases) {
            // Артикул товара в фиде передаётся как item.price_offer_id или item.article, либо purchase.item_id
            const rawArticle =
              purchase.item?.price_offer_id ??
              purchase.item?.article ??
              purchase.item_id;

            const tcod = parseInt(String(rawArticle), 10);
            const qty = Number(purchase.quantity ?? 1);

            if (!isNaN(tcod) && tcod > 0 && qty > 0) {
              try {
                const deduction = await this.limanService.deductStock(tenant, tcod, qty);
                deductedList.push({
                  tcod,
                  qty,
                  oldStock: deduction.oldStock,
                  newStock: deduction.newStock,
                });
                result.itemsDeducted += qty;
              } catch (deductErr) {
                this.logger.error(
                  `❌ [${tenant.id}] Ошибка списания остатка tcod=${tcod} по заказу ${orderSummary.id}:`,
                  deductErr,
                );
                result.errors++;
              }
            }
          }

          result.orders.push({
            orderId: orderSummary.id,
            items: deductedList,
          });
          result.ordersProcessed++;
        } catch (orderErr) {
          this.logger.error(
            `❌ [${tenant.id}] Ошибка обработки заказа ${orderSummary.id}:`,
            orderErr,
          );
          result.errors++;
        }
      }
    } catch (err) {
      this.logger.error(`❌ [${tenant.id}] Ошибка синхронизации заказов Rozetka:`, err);
      result.errors++;
    }

    return result;
  }
}
