import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ImportWooCatalogJobData } from './queue.constants';
import { TenantService } from '../tenant/tenant.service';
import { WoocommerceImportService } from '../woocommerce/woocommerce-import.service';
import { AlertService } from '../alert/alert.service';

/**
 * Воркер фоновой очереди BullMQ для асинхронного импорта каталога WooCommerce → Limansoft MariaDB.
 *
 * Запускается через POST /woocommerce/:tenantId/import/products, возвращает jobId немедленно.
 * Статус можно отслеживать через GET /sync/jobs/:queue/:jobId.
 */
@Processor(QUEUE_NAMES.IMPORT_WOO_CATALOG)
export class WooImportProcessor extends WorkerHost {
  private readonly logger = new Logger(WooImportProcessor.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly importService: WoocommerceImportService,
    @Optional() private readonly alertService?: AlertService,
  ) {
    super();
  }

  async process(job: Job<ImportWooCatalogJobData>): Promise<{
    totalProcessed: number;
    created: number;
    updated: number;
    errors: number;
    durationMs: number;
  }> {
    const { tenantId, limit, page } = job.data;
    this.logger.log(`⏳ [${tenantId}] Старт фонового импорта каталога WooCommerce (limit=${limit ?? 1000}, page=${page ?? 1})`);

    const startTime = Date.now();

    try {
      const tenant = await this.tenantService.findOne(tenantId);

      const result = await this.importService.importAllProducts(tenant, {
        limit,
        page,
        onProgress: async (processed, total) => {
          const percent = Math.round((processed / total) * 100);
          await job.updateProgress(percent);
        },
      });

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `✅ [${tenantId}] Импорт завершен за ${durationMs}ms: создано ${result.created}, обновлено ${result.updated}, ошибок ${result.errors}`,
      );

      return {
        totalProcessed: result.totalProcessed,
        created: result.created,
        updated: result.updated,
        errors: result.errors,
        durationMs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ [${tenantId}] Ошибка фонового импорта каталога WooCommerce: ${errorMsg}`, error instanceof Error ? error.stack : undefined);

      void this.alertService?.sendCritical(
        'bullmq',
        `Сбой фонового импорта WooCommerce [${tenantId}]`,
        `Фоновая задача импорта каталога WooCommerce завершилась с ошибкой: ${errorMsg}`,
        error instanceof Error ? error.stack ?? error.message : String(error),
        tenantId,
        { jobId: job.id, queue: QUEUE_NAMES.IMPORT_WOO_CATALOG, attemptsMade: job.attemptsMade },
      );

      throw error;
    }
  }
}
