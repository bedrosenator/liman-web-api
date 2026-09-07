import { Injectable, Logger } from '@nestjs/common';
import { LimanService } from '../liman/liman.service';
import { RozetkaApiClient, RozetkaStockItem, RozetzkaPrice } from './rozetka-api.client';
import { Tenant } from '../tenant/tenant.entity';

const BATCH_SIZE = 100; // Rozetka принимает до 500, используем 100 для надёжности

export interface RozetzkasSyncResult {
  stocksSynced: number;
  pricesSynced: number;
  errors: number;
  durationMs: number;
}

/**
 * Сервис дельта-синхронизации цен и остатков в Rozetka Seller API
 */
@Injectable()
export class RozetzkasSyncService {
  private readonly logger = new Logger(RozetzkasSyncService.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly rozetkaClient: RozetkaApiClient,
  ) {}

  /**
   * Полная синхронизация цен и остатков всего каталога → Rozetka Seller API
   */
  async syncPricesAndStocks(
    tenant: Tenant,
    baseUrl: string,
  ): Promise<RozetzkasSyncResult> {
    const startTime = Date.now();
    const totalCount = await this.limanService.getProductCount(tenant);

    this.logger.log(
      `🔄 [${tenant.id}] Начало синхронизации ${totalCount} товаров в Rozetka Seller API`,
    );

    let stocksSynced = 0;
    let pricesSynced = 0;
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

      // Формируем пакеты для Rozetka
      // item_id в Rozetka = id предложения в фиде = наш tcod
      const stockItems: RozetkaStockItem[] = items.map((p) => ({
        item_id: p.tcod,
        stock: Math.max(0, Math.floor(p.stock)),
      }));

      const priceItems: RozetzkaPrice[] = items
        .filter((p) => p.price > 0)
        .map((p) => ({
          item_id: p.tcod,
          price: parseFloat(p.price.toFixed(2)),
        }));

      // Обновляем остатки
      try {
        const stockResult = await this.rozetkaClient.updateStocks(tenant, stockItems);
        stocksSynced += stockResult.updated;
      } catch {
        this.logger.error(`❌ [${tenant.id}] Ошибка обновления остатков (стр. ${page})`);
        errors += stockItems.length;
      }

      // Обновляем цены
      try {
        const priceResult = await this.rozetkaClient.updatePrices(tenant, priceItems);
        pricesSynced += priceResult.updated;
      } catch {
        this.logger.error(`❌ [${tenant.id}] Ошибка обновления цен (стр. ${page})`);
        errors += priceItems.length;
      }

      page++;
      if (items.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `✅ [${tenant.id}] Rozetka sync завершён за ${durationMs}ms. Остатков: ${stocksSynced}, Цен: ${pricesSynced}, Ошибок: ${errors}`,
    );

    return { stocksSynced, pricesSynced, errors, durationMs };
  }
}
