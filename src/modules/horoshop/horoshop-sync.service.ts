import { Injectable, Logger } from '@nestjs/common';
import { LimanService } from '../liman/liman.service';
import { Tenant } from '../tenant/tenant.entity';
import { HoroshopApiClient, HoroshopStockPriceItem } from './horoshop-api.client';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class HoroshopSyncService {
  private readonly logger = new Logger(HoroshopSyncService.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly horoshopClient: HoroshopApiClient,
    private readonly tenantService: TenantService,
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
}
