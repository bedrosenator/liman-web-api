import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, SyncStockJobData } from './queue.constants';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import {
  PromApiClient,
  PromProductPriceStockUpdate,
} from '../prom/prom-api.client';
import {
  HoroshopApiClient,
  HoroshopStockPriceItem,
} from '../horoshop/horoshop-api.client';
import { HoroshopSyncService } from '../horoshop/horoshop-sync.service';
import { AlertService } from '../alert/alert.service';

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
    @Optional()
    @Inject(forwardRef(() => HoroshopApiClient))
    private readonly horoshopClient?: HoroshopApiClient,
    @Optional()
    @Inject(forwardRef(() => HoroshopSyncService))
    private readonly horoshopSyncService?: HoroshopSyncService,
    @Optional() private readonly alertService?: AlertService,
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
    this.logger.log(
      `⏳ Начало обработки задачи синхронизации остатков/цен для "${tenantId}" -> [${targetPlatform}]`,
    );

    try {
      const tenant = await this.tenantService.findOne(tenantId);
      if (!tenant.promApiKey && targetPlatform === 'prom') {
        throw new Error(`У тенанта "${tenantId}" не указан promApiKey`);
      }
      if (!tenant.horoshopDomain && targetPlatform === 'horoshop') {
        throw new Error(`У тенанта "${tenantId}" не указан horoshopDomain`);
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
          const updatePayload: PromProductPriceStockUpdate[] = items.map(
            (p) => ({
              external_id: String(p.tcod),
              price: p.price,
              presence: p.isAvailable ? 'available' : 'not_available',
              quantity_in_stock: p.stock,
            }),
          );

          await this.promApiClient.editPricesAndStock(
            tenant.promApiKey!,
            updatePayload,
          );
        } else if (targetPlatform === 'horoshop') {
          if (this.horoshopSyncService) {
            const syncRes = await this.horoshopSyncService.syncPricesAndStocks(
              tenant,
              {
                batchSize: chunkSize,
                limit: job.data.limit,
                integrationId: job.data.integrationId,
              },
            );
            totalProcessed = syncRes.processed;
            await job.updateProgress(100);
            break;
          } else if (this.horoshopClient) {
            const updatePayload: HoroshopStockPriceItem[] = items.map((p) => ({
              article: String(p.tcod),
              price: p.price,
              stock: p.stock,
              presence: p.stock > 0,
            }));
            await this.horoshopClient.updateStocksAndPrices(
              tenant,
              updatePayload,
            );
          }
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

      if (targetPlatform === 'horoshop') {
        this.horoshopSyncService?.addActivity(tenant.id, {
          type: 'sync',
          status: 'success',
          titleRu: `Синхронизация цен и остатков (${totalProcessed} товаров)`,
          titleUk: `Синхронізація цін та залишків (${totalProcessed} товарів)`,
          detailsRu: `Успешно обновлено через фоновую очередь BullMQ за ${durationMs}мс`,
          detailsUk: `Успішно оновлено через фонову чергу BullMQ за ${durationMs}мс`,
        });
      }

      return {
        processed: totalProcessed,
        success: true,
        durationMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Ошибка выполнения задачи синхронизации [${tenantId}] (${targetPlatform}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      void this.alertService?.sendCritical(
        'bullmq',
        `Сбой очереди BullMQ: ${targetPlatform} [${tenantId}]`,
        `Фоновая синхронизация остатков/цен завершилась с ошибкой: ${errorMessage}`,
        error instanceof Error ? error.stack || error.message : String(error),
        tenantId,
        {
          jobId: job.id,
          queue: QUEUE_NAMES.SYNC_STOCK,
          targetPlatform,
          attemptsMade: job.attemptsMade,
        },
      );

      throw error;
    }
  }
}
