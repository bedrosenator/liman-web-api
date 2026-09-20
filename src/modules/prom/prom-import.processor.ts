import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import {
  QUEUE_NAMES,
  ImportPromCatalogJobData,
} from '../queue/queue.constants';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { PromApiClient, PromProductItem } from './prom-api.client';
import { PromSyncService } from './prom-sync.service';
import { BackupService } from '../backup/backup.service';
import { AlertService } from '../alert/alert.service';
import { ProductMappingService } from '../tenant/product-mapping.service';

const MAX_IMAGES_PER_PRODUCT = 3;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10000;
const THROTTLE_DELAY_MS = 200;

/**
 * Воркер фоновой очереди BullMQ для обратной синхронизации каталога:
 * Prom.ua -> Limansoft MariaDB
 */
@Processor(QUEUE_NAMES.IMPORT_PROM_CATALOG)
export class PromImportProcessor extends WorkerHost {
  private readonly logger = new Logger(PromImportProcessor.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
    private readonly promClient: PromApiClient,
    private readonly promSyncService: PromSyncService,
    @Optional() private readonly backupService?: BackupService,
    @Optional() private readonly alertService?: AlertService,
    @Optional() private readonly productMappingService?: ProductMappingService,
  ) {
    super();
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        this.logger.warn(`⚠️ Ошибка скачивания фото ${url}: ${err.message}`);
      }
    }

    return buffers;
  }

  async process(job: Job<ImportPromCatalogJobData>): Promise<{
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
      `🚀 [${tenantId}] Начало импорта каталога из Prom.ua в Limansoft MariaDB (режим: ${mode})`,
    );

    let lockAcquired = false;
    let backupId: string | undefined;

    try {
      const tenant = await this.tenantService.findOne(tenantId);
      if (!tenant.promApiKey) {
        throw new Error(`У тенанта "${tenantId}" не настроен promApiKey`);
      }

      let targetIntegrationId = job.data.integrationId;
      if (!targetIntegrationId && this.productMappingService) {
        const activeIntegration =
          await this.promSyncService.resolveIntegration(tenantId);
        targetIntegrationId = activeIntegration?.id;
      }

      // 1. Предварительный бэкап базы данных тенанта
      if (createBackup && this.backupService) {
        try {
          this.logger.log(
            `🛡️ [${tenantId}] Создание резервной копии MariaDB перед импортом Prom...`,
          );
          const backupMeta = await this.backupService.createBackup(
            tenantId,
            'fast',
          );
          backupId = backupMeta.filename;
          this.logger.log(
            `✅ [${tenantId}] Бэкап успешно создан: ${backupMeta.filename}`,
          );
        } catch (err: any) {
          this.logger.warn(
            `⚠️ [${tenantId}] Не удалось создать бэкап перед импортом: ${err.message}. Продолжаем...`,
          );
        }
      }

      // 2. Распределенная блокировка Redis
      if (this.backupService) {
        lockAcquired = await this.backupService.acquireLock(tenantId);
        if (!lockAcquired) {
          throw new Error(
            `База данных тенанта "${tenantId}" занята другой операцией. Попробуйте позже.`,
          );
        }
      }

      await job.updateProgress(5);

      const pageSize = 50;
      let totalFetched = 0;
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      let lastId: number | undefined = undefined;

      while (true) {
        const fetchLimit = limit
          ? Math.min(pageSize, limit - totalFetched)
          : pageSize;
        if (fetchLimit <= 0) break;

        const products: PromProductItem[] = await this.promClient.getProducts(
          tenant.promApiKey,
          {
            limit: fetchLimit,
            last_id: lastId,
          },
        );

        if (!products || products.length === 0) {
          break;
        }

        for (const product of products) {
          totalFetched++;
          lastId = product.id;

          try {
            const article = String(
              product.external_id || product.sku || product.id,
            ).trim();

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

            // Извлечение ссылок на фото
            const imageUrls: string[] = [];
            if (product.main_image) imageUrls.push(product.main_image);
            if (product.images) {
              for (const img of product.images) {
                if (img.url && !imageUrls.includes(img.url)) {
                  imageUrls.push(img.url);
                }
              }
            }

            // Скачиваем фото, если включено
            const photos = updateImages
              ? await this.downloadImages(imageUrls)
              : [];

            const categoryName =
              product.group?.name || product.category?.caption;

            const upsertResult =
              await this.limanService.upsertProductFromExternal(tenant, {
                sku: article,
                barcode: product.sku || undefined,
                name: product.name,
                price: updatePrices ? product.price : undefined,
                stock: updateStock ? (product.quantity_in_stock ?? 0) : undefined,
                categoryName,
                description: product.description,
                photos,
              });

            if (upsertResult.action === 'created') {
              created++;
            } else {
              updated++;
            }

            // Сохранение связи в product_mappings
            if (
              targetIntegrationId &&
              this.productMappingService &&
              upsertResult.tcod
            ) {
              await this.productMappingService.saveMapping({
                tenantId,
                integrationId: targetIntegrationId,
                limanTcod: upsertResult.tcod,
                externalArticle: article,
                limanBarcode: product.sku || null,
                limanArticul: article,
                syncStatus: 'synced',
                metadata: {
                  promId: product.id,
                  categoryName,
                  source: 'prom_import',
                  importedAt: new Date().toISOString(),
                },
              });
            }
          } catch (itemErr: any) {
            this.logger.error(
              `❌ [${tenantId}] Ошибка импорта позиции Prom ID=${product.id}: ${itemErr.message}`,
            );
            errors++;
          }

          if (limit && totalFetched >= limit) {
            break;
          }
        }

        // Обновление прогресса
        const progress = limit
          ? Math.min(95, Math.round((totalFetched / limit) * 90) + 5)
          : Math.min(95, Math.round((totalFetched / (totalFetched + 20)) * 90) + 5);
        await job.updateProgress(progress);

        if (products.length < fetchLimit || (limit && totalFetched >= limit)) {
          break;
        }

        await this.sleep(THROTTLE_DELAY_MS);
      }

      await job.updateProgress(100);

      this.promSyncService.addActivity(tenantId, {
        type: 'sync',
        status: errors === 0 ? 'success' : 'warning',
        titleRu: `Импорт каталога Prom.ua завершен: ${totalFetched} товаров`,
        titleUk: `Імпорт каталогу Prom.ua завершено: ${totalFetched} товарів`,
        detailsRu: `Создано: ${created}, обновлено: ${updated}, пропущено: ${skipped}, ошибок: ${errors}`,
        detailsUk: `Створено: ${created}, оновлено: ${updated}, пропущено: ${skipped}, помилок: ${errors}`,
      });

      return {
        success: true,
        totalFetched,
        created,
        updated,
        skipped,
        errors,
        durationMs: Date.now() - startTime,
        backupId,
      };
    } catch (err: any) {
      this.logger.error(
        `❌ [${tenantId}] Критический сбой импорта каталога из Prom.ua: ${err.message}`,
        err.stack,
      );
      this.promSyncService.addActivity(tenantId, {
        type: 'sync',
        status: 'error',
        titleRu: 'Сбой импорта каталога Prom.ua',
        titleUk: 'Збій імпорту каталогу Prom.ua',
        detailsRu: `Критическая ошибка: ${err.message}`,
        detailsUk: `Критична помилка: ${err.message}`,
      });
      throw err;
    } finally {
      if (lockAcquired && this.backupService) {
        await this.backupService.releaseLock(tenantId);
      }
    }
  }
}
