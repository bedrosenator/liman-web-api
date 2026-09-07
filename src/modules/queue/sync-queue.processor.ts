import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, SyncStockJobData } from './queue.constants';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { PromApiClient, PromProductPriceStockUpdate } from '../prom/prom-api.client';

/**
 * Воркер фоновой очереди BullMQ для асинхронной синхронизации складских остатков и цен.
 *
 * Преимущества архитектуры через очереди:
 * 1. Изоляция от HTTP: клиент не ждет завершения долгой синхронизации (10 000+ товаров) и не сталкивается с 504 Gateway Timeout.
 * 2. Прогресс в реальном времени: каждые 100 товаров воркер обновляет `job.updateProgress(percent)`,
 *    что позволяет фронтенду или API отслеживать процесс от 0 до 100%.
 * 3. Авто-повторы: при сбоях сети Redis/BullMQ автоматически перезапустит задачу с задержкой.
 */
@Processor(QUEUE_NAMES.SYNC_STOCK)
export class StockSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(StockSyncProcessor.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
    private readonly promApiClient: PromApiClient,
  ) {
    super();
  }

  /**
   * Точка входа для выполнения фоновой задачи синхронизации
   * @param job Объект задачи BullMQ с данными тенанта и целевой платформы
   * @returns Отчет о выполнении с числом обработанных товаров и временем работы
   */
  async process(job: Job<SyncStockJobData>): Promise<{
    processed: number;
    success: boolean;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const { tenantId, targetPlatform } = job.data;
    this.logger.log(`⏳ Начало обработки задачи синхронизации остатков/цен для "${tenantId}" -> [${targetPlatform}]`);

    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.promApiKey && targetPlatform === 'prom') {
      throw new Error(`У тенанта "${tenantId}" не указан promApiKey`);
    }

    const totalCount = await this.limanService.getProductCount(tenant);
    this.logger.log(`Всего товаров к синхронизации: ${totalCount}`);

    const chunkSize = 100;
    const totalPages = Math.ceil(totalCount / chunkSize);
    let totalProcessed = 0;

    for (let page = 1; page <= totalPages; page++) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: chunkSize,
      });

      if (items.length === 0) break;

      if (targetPlatform === 'prom') {
        const updatePayload: PromProductPriceStockUpdate[] = items.map((p) => ({
          external_id: String(p.tcod),
          price: p.price,
          presence: p.isAvailable ? 'available' : 'not_available',
          quantity_in_stock: p.stock,
        }));

        await this.promApiClient.editPricesAndStock(tenant.promApiKey!, updatePayload);
      }

      totalProcessed += items.length;
      const progressPercent = Math.round((totalProcessed / totalCount) * 100);
      await job.updateProgress(progressPercent);

      this.logger.log(
        `📊 Прогресс [${tenantId}]: ${totalProcessed}/${totalCount} (${progressPercent}%)`,
      );
    }

    // Обновляем время последней синхронизации у тенанта
    await this.tenantService.update(tenant.id, { lastSyncAt: new Date() });

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `✅ Синхронизация [${tenantId}] успешно завершена за ${durationMs}ms! Обработано: ${totalProcessed} SKU.`,
    );

    return {
      processed: totalProcessed,
      success: true,
      durationMs,
    };
  }
}
