import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import { QUEUE_NAMES, ImportHoroshopCatalogJobData } from '../queue/queue.constants';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { HoroshopApiClient } from './horoshop-api.client';
import { HoroshopSyncService } from './horoshop-sync.service';
import { BackupService } from '../backup/backup.service';
import { AlertService } from '../alert/alert.service';

const MAX_IMAGES_PER_PRODUCT = 3;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10000;
const THROTTLE_DELAY_MS = 250;

/**
 * Воркер фоновой очереди BullMQ для обратной синхронизации каталога:
 * Хорошоп -> Limansoft MariaDB (TASK-22)
 *
 * Особенности:
 * 1. Защита от Race Condition через распределенные блокировки Redis (lock:tenant:{tenantId}:busy);
 * 2. Автоматическое создание точки отката (BackupService.createBackup) перед модификацией БД;
 * 3. Два режима работы: «Только новинки» (Safe Mode) vs «Полное обновление» (Overwrite);
 * 4. Защита от Rate Limiting API Хорошоп (пакетная выгрузка с троттлингом);
 * 5. Атомарная запись в MariaDB (name2, name2ost, namedesc, strihcod);
 * 6. Потоковое обновление прогресса задачи для отображения в Личном Кабинете.
 */
@Processor(QUEUE_NAMES.IMPORT_HOROSHOP_CATALOG)
export class HoroshopImportProcessor extends WorkerHost {
  private readonly logger = new Logger(HoroshopImportProcessor.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
    private readonly horoshopClient: HoroshopApiClient,
    private readonly horoshopSyncService: HoroshopSyncService,
    @Optional() private readonly backupService?: BackupService,
    @Optional() private readonly alertService?: AlertService,
  ) {
    super();
  }

  /**
   * Скачать фотографии товара по URL
   */
  private async downloadImages(images?: string[]): Promise<Buffer[]> {
    if (!images || !images.length) return [];

    const buffers: Buffer[] = [];
    const targetImages = images.slice(0, MAX_IMAGES_PER_PRODUCT);

    for (const url of targetImages) {
      if (!url || !url.startsWith('http')) continue;
      try {
        const res = await axios.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
        });
        if (res.data && res.data.byteLength > 0) {
          buffers.push(Buffer.from(res.data));
        }
      } catch (err: any) {
        this.logger.warn(`⚠️ [TASK-22] Ошибка скачивания фото ${url}: ${err.message}`);
      }
    }

    return buffers;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async process(job: Job<ImportHoroshopCatalogJobData>): Promise<{
    success: boolean;
    totalFetched: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    durationMs: number;
    backupId?: string;
  }> {
    const startTime = Date.now();
    const {
      tenantId,
      mode = 'only_new',
      updatePrices = true,
      updateStock = true,
      updateImages = true,
      createBackup = true,
      limit,
    } = job.data;

    this.logger.log(
      `🚀 [${tenantId}] Начало импорта каталога из Хорошоп в Limansoft MariaDB (режим: ${mode})`,
    );

    let lockAcquired = false;
    let backupId: string | undefined;

    try {
      const tenant = await this.tenantService.findOne(tenantId);

      // 1. Предварительный бэкап базы данных тенанта
      if (createBackup && this.backupService) {
        try {
          this.logger.log(`🛡️ [${tenantId}] Создание резервной копии MariaDB перед импортом...`);
          const backupMeta = await this.backupService.createBackup(tenantId, 'fast');
          backupId = backupMeta.filename;
          this.logger.log(`✅ [${tenantId}] Бэкап успешно создан: ${backupMeta.filename}`);
        } catch (err: any) {
          this.logger.warn(
            `⚠️ [${tenantId}] Не удалось создать бэкап перед импортом: ${err.message}. Продолжаем импорт...`,
          );
        }
      }

      // 2. Установка распределенной блокировки Redis
      if (this.backupService) {
        lockAcquired = await this.backupService.acquireLock(tenantId);
        if (!lockAcquired) {
          throw new Error(
            `База данных тенанта "${tenantId}" сейчас занята другой операцией (бэкап/восстановление/синхронизация). Попробуйте позже.`,
          );
        }
      }

      let page = 1;
      const pageSize = 50;
      let totalFetched = 0;
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      while (true) {
        // Выгружаем страницу каталога из Хорошоп API
        const exportRes = await this.horoshopClient.exportCatalog(tenant, {
          page,
          limit: pageSize,
        });

        const products = exportRes?.response?.products || [];
        if (!products.length) {
          break;
        }

        const totalEstimated = exportRes?.response?.total || (totalFetched + products.length);

        for (const product of products) {
          totalFetched++;
          try {
            const article = String(product.article || '').trim();
            if (!article) {
              skipped++;
              continue;
            }

            // В режиме «Только новинки» проверяем наличие
            if (mode === 'only_new') {
              const existing = await this.limanService.findProductBySkuOrBarcode(
                tenant,
                article,
              );
              if (existing) {
                skipped++;
                continue;
              }
            }

            // Скачиваем фото, если включено
            const photos = updateImages
              ? await this.downloadImages(product.images)
              : [];

            const upsertResult = await this.limanService.upsertProductFromExternal(
              tenant,
              {
                sku: article,
                barcode: product.barcode,
                name: product.title,
                price: updatePrices ? product.price : undefined,
                stock: updateStock ? (product.stock ?? 0) : undefined,
                categoryName: product.category,
                description: product.description,
                photos,
              },
            );

            if (upsertResult.action === 'created') {
              created++;
            } else {
              updated++;
            }
          } catch (itemErr: any) {
            this.logger.error(
              `❌ [${tenantId}] Ошибка импорта позиции article=${product.article}: ${itemErr.message}`,
            );
            errors++;
          }

          if (limit && totalFetched >= limit) {
            break;
          }
        }

        const progressPercent = Math.min(
          100,
          Math.round((totalFetched / Math.max(1, totalEstimated)) * 100),
        );
        await job.updateProgress(progressPercent);

        if (limit && totalFetched >= limit) {
          break;
        }

        if (products.length < pageSize) {
          break;
        }

        page++;
        // Троттлинг между страницами
        await this.sleep(THROTTLE_DELAY_MS);
      }

      await job.updateProgress(100);
      const durationMs = Date.now() - startTime;

      // Запись в Activity Feed
      this.horoshopSyncService.addActivity(tenantId, {
        type: 'sync',
        status: errors > 0 ? 'warning' : 'success',
        titleRu: `Импорт каталога Хорошоп -> MariaDB (${totalFetched} SKU)`,
        titleUk: `Імпорт каталогу Хорошоп -> MariaDB (${totalFetched} SKU)`,
        detailsRu: `Создано: ${created}, обновлено: ${updated}, пропущено: ${skipped}, ошибок: ${errors} за ${durationMs}мс`,
        detailsUk: `Створено: ${created}, оновлено: ${updated}, пропущено: ${skipped}, помилок: ${errors} за ${durationMs}мс`,
      });

      this.logger.log(
        `🏁 [${tenantId}] Импорт каталога Хорошоп завершен: получено ${totalFetched}, создано ${created}, обновлено ${updated}, пропущено ${skipped}, ошибок ${errors} (${durationMs}ms)`,
      );

      return {
        success: true,
        totalFetched,
        created,
        updated,
        skipped,
        errors,
        durationMs,
        backupId,
      };
    } catch (err: any) {
      this.logger.error(
        `❌ [${tenantId}] Сбой фонового импорта каталога Хорошоп: ${err.message}`,
        err.stack,
      );

      void this.alertService?.sendCritical(
        'horoshop',
        `Сбой импорта каталога Хорошоп [${tenantId}]`,
        `Ошибка фонового импорта каталога: ${err.message}`,
        err.stack,
        tenantId,
        { jobId: job.id, mode },
      );

      throw err;
    } finally {
      if (lockAcquired && this.backupService) {
        await this.backupService.releaseLock(tenantId);
      }
    }
  }
}
