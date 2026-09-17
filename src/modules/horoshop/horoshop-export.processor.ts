import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  ExportHoroshopCatalogJobData,
} from '../queue/queue.constants';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import {
  HoroshopApiClient,
  HOROSHOP_CONSTANTS,
  HoroshopCatalogProductItem,
  HoroshopCatalogCategoryItem,
} from './horoshop-api.client';
import { HoroshopSyncService } from './horoshop-sync.service';
import { AlertService } from '../alert/alert.service';
import { ProductMappingService } from '../tenant/product-mapping.service';
import { Tenant } from '../tenant/tenant.entity';
import { LimanProductDto } from '../liman/dto/liman-product.dto';

const EXPORT_BATCH_SIZE = 100;
const THROTTLE_DELAY_MS = 250;
const FETCH_BATCH_SIZE = 500;
const PROGRESS_INITIAL_PERCENT = 15;
const PROGRESS_RANGE_PERCENT = 83;
const PROGRESS_MAX_BEFORE_DONE = 98;

export interface HoroshopExportResult {
  success: boolean;
  totalFetched: number;
  totalExported: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

/**
 * Воркер фоновой очереди BullMQ для прямого экспорта каталога:
 * Limansoft MariaDB -> Хорошоп (TASK-26)
 *
 * Особенности:
 * 1. Пакетная отправка по 50-100 товаров с троттлингом (250мс);
 * 2. Три режима работы: «Только новинки» (only_new), «Обновить существующие» (update_existing), «Полная перезапись» (full_overwrite);
 * 3. Настраиваемый состав данных: цены, остатки склада, фото, описания, категории;
 * 4. Автоматическая регистрация связей в PostgreSQL product_mappings;
 * 5. Потоковое обновление прогресса задачи для прогресс-бара в UI;
 * 6. Логирование результатов в ActivityFeed.
 */
@Processor(QUEUE_NAMES.EXPORT_HOROSHOP_CATALOG)
export class HoroshopExportProcessor extends WorkerHost {
  private readonly logger = new Logger(HoroshopExportProcessor.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
    private readonly horoshopClient: HoroshopApiClient,
    private readonly horoshopSyncService: HoroshopSyncService,
    @Optional() private readonly productMappingService?: ProductMappingService,
    @Optional() private readonly alertService?: AlertService,
  ) {
    super();
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Разрешить активную интеграцию с Хорошоп
   */
  private async resolveIntegration(tenant: Tenant, integrationId?: string) {
    if (!this.productMappingService) return null;
    return this.productMappingService.resolveActiveIntegration(
      tenant.id,
      'horoshop',
      integrationId,
      {
        name: tenant.horoshopShopTitle || `${tenant.name} (Хорошоп)`,
        credentials: {
          domain: tenant.horoshopDomain,
          login: tenant.horoshopLogin,
        },
        settings: {
          priceColumn: tenant.priceColumn,
          stockColumn: tenant.stockColumn,
        },
      },
    );
  }

  /**
   * Фильтрация товаров по выбранному режиму экспорта
   */
  private filterProductsByMode(
    products: LimanProductDto[],
    mappedTcods: Set<number>,
    mode: 'only_new' | 'update_existing' | 'full_overwrite',
  ): { targetProducts: LimanProductDto[]; skippedCount: number } {
    if (mode === 'full_overwrite') {
      return {
        targetProducts: products,
        skippedCount: 0,
      };
    }

    const predicate =
      mode === 'only_new'
        ? (tcod: number) => !mappedTcods.has(tcod)
        : (tcod: number) => mappedTcods.has(tcod);

    const targetProducts = products.filter((p) => predicate(p.tcod));
    return {
      targetProducts,
      skippedCount: products.length - targetProducts.length,
    };
  }

  /**
   * Построить структуру товара для отправки в Хорошоп
   */
  private buildProductItem(
    product: LimanProductDto,
    categoryName: string | undefined,
    options: ExportHoroshopCatalogJobData,
  ): HoroshopCatalogProductItem {
    const item: HoroshopCatalogProductItem = {
      article: String(product.tcod),
      title: product.name,
    };

    if (options.exportPrices !== false) {
      item.price = product.price;
    }

    if (options.exportStock !== false) {
      item.quantity = Math.max(0, product.stock);
      item.presence =
        product.stock > 0
          ? HOROSHOP_CONSTANTS.PRESENCE_IN_STOCK
          : HOROSHOP_CONSTANTS.PRESENCE_OUT_OF_STOCK;
    }

    if (product.barcode) {
      item.barcode = product.barcode;
    }

    if (options.exportCategories !== false && categoryName) {
      item.parent = categoryName;
    }

    if (options.exportDescriptions !== false && product.description) {
      item.description = product.description;
    }

    if (
      options.exportImages !== false &&
      product.imageUrls &&
      product.imageUrls.length > 0
    ) {
      item.images = product.imageUrls;
    }

    return item;
  }

  /**
   * Безопасное сохранение маппингов после отправки чанка
   */
  private async persistExportMappingsSafe(
    tenant: Tenant,
    integrationId: string,
    products: LimanProductDto[],
    log: Array<{ article: string; code: number; message?: string }>,
  ): Promise<void> {
    if (!this.productMappingService) return;

    try {
      const errorArticles = new Set(
        log
          .filter((l) => l.code !== HOROSHOP_CONSTANTS.API_CODE_SUCCESS)
          .map((l) => String(l.article)),
      );

      const mappingItems = products.map((p) => {
        const art = String(p.tcod);
        const hasError = errorArticles.has(art);
        return {
          tenantId: tenant.id,
          integrationId,
          limanTcod: p.tcod,
          externalArticle: art,
          limanBarcode: p.barcode || null,
          limanArticul: p.barcode || null,
          syncStatus: hasError ? ('error' as const) : ('synced' as const),
          metadata: {
            name: p.name,
            price: p.price,
            stock: p.stock,
            exportedAt: new Date().toISOString(),
          },
        };
      });

      await this.productMappingService.saveBatchMappings(mappingItems);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ [TASK-26] Не удалось сохранить связи товаров в product_mappings: ${err.message}`,
      );
    }
  }

  async process(
    job: Job<ExportHoroshopCatalogJobData>,
  ): Promise<HoroshopExportResult> {
    const startTime = Date.now();
    const {
      tenantId,
      integrationId,
      mode = 'full_overwrite',
      limit,
    } = job.data;

    this.logger.log(
      `🚀 [${tenantId}] Запуск прямого экспорта каталога в Хорошоп (режим: ${mode})`,
    );

    const tenant = await this.tenantService.findOne(tenantId);
    const activeIntegration = await this.resolveIntegration(
      tenant,
      integrationId,
    );
    const currentIntegrationId = activeIntegration?.id;

    // 1. Загрузка категорий и товаров из Limansoft MariaDB
    await job.updateProgress(5);
    const categories = await this.limanService.getCategories(tenant);
    const categoryMap = new Map<string, string>();
    for (const cat of categories) {
      if (cat.group) {
        categoryMap.set(cat.group, cat.name);
      }
    }

    await job.updateProgress(10);
    const allProducts: LimanProductDto[] = [];
    let page = 1;

    while (true) {
      const remainingLimit = limit ? limit - allProducts.length : undefined;
      if (remainingLimit !== undefined && remainingLimit <= 0) {
        break;
      }

      const fetchLimit =
        remainingLimit !== undefined
          ? Math.min(FETCH_BATCH_SIZE, remainingLimit)
          : FETCH_BATCH_SIZE;

      const pageRes = await this.limanService.getProducts(tenant, {
        page,
        limit: fetchLimit,
      });

      const items = pageRes.items || [];
      if (items.length === 0) {
        break;
      }

      allProducts.push(...items);

      if (items.length < fetchLimit || allProducts.length >= pageRes.total) {
        break;
      }

      page++;
    }

    const totalFetched = allProducts.length;

    if (totalFetched === 0) {
      this.logger.warn(`⚠️ [${tenantId}] В базе Limansoft не найдено товаров для экспорта`);
      await job.updateProgress(100);
      return {
        success: true,
        totalFetched: 0,
        totalExported: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Получение существующих связей для фильтрации по режиму
    let mappedTcods = new Set<number>();
    if (this.productMappingService && currentIntegrationId) {
      mappedTcods = await this.productMappingService.getAllMappedTcods(
        currentIntegrationId,
      );
    }

    const { targetProducts, skippedCount } = this.filterProductsByMode(
      allProducts,
      mappedTcods,
      mode,
    );

    if (targetProducts.length === 0) {
      this.logger.log(
        `ℹ️ [${tenantId}] Все товары (${totalFetched}) отфильтрованы по условию режима ${mode}`,
      );
      await job.updateProgress(100);
      return {
        success: true,
        totalFetched,
        totalExported: 0,
        created: 0,
        updated: 0,
        skipped: skippedCount,
        errors: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Подготовка структуры категорий для отправки (если экспорт категорий включен)
    const exportCategoriesPayload: HoroshopCatalogCategoryItem[] =
      job.data.exportCategories !== false
        ? categories.map((c) => ({
            id: c.group,
            name: c.name,
            parent: c.parent ? categoryMap.get(c.parent) : undefined,
          }))
        : [];

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    const totalTarget = targetProducts.length;

    // 4. Пакетная отправка порциями по EXPORT_BATCH_SIZE
    const chunks: LimanProductDto[][] = [];
    for (let i = 0; i < totalTarget; i += EXPORT_BATCH_SIZE) {
      chunks.push(targetProducts.slice(i, i + EXPORT_BATCH_SIZE));
    }

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const itemsPayload: HoroshopCatalogProductItem[] = chunk.map((p) =>
        this.buildProductItem(
          p,
          p.categoryGroup ? categoryMap.get(p.categoryGroup) : undefined,
          job.data,
        ),
      );

      try {
        const res = await this.horoshopClient.importCatalog(tenant, {
          products: itemsPayload,
          categories: idx === 0 ? exportCategoriesPayload : undefined,
        });

        totalCreated += res.created || 0;
        totalUpdated += res.updated || 0;

        const chunkErrors = (res.log || []).filter(
          (l) => l.code !== HOROSHOP_CONSTANTS.API_CODE_SUCCESS,
        ).length;
        totalErrors += chunkErrors;

        if (currentIntegrationId) {
          await this.persistExportMappingsSafe(
            tenant,
            currentIntegrationId,
            chunk,
            res.log || [],
          );
        }
      } catch (err: any) {
        totalErrors += chunk.length;
        this.logger.error(
          `❌ [${tenantId}] Ошибка отправки пакета экспорта #${idx + 1}: ${err.message}`,
        );
      }

      const progress = Math.min(
        PROGRESS_MAX_BEFORE_DONE,
        Math.round(
          PROGRESS_INITIAL_PERCENT +
            ((idx + 1) / chunks.length) * PROGRESS_RANGE_PERCENT,
        ),
      );
      await job.updateProgress(progress);

      if (idx < chunks.length - 1) {
        await this.sleep(THROTTLE_DELAY_MS);
      }
    }

    const durationMs = Date.now() - startTime;
    await job.updateProgress(100);

    // 5. Запись события в ActivityFeed
    this.horoshopSyncService.addActivity(tenantId, {
      type: 'sync',
      status: totalErrors > 0 ? 'warning' : 'success',
      titleRu: `Прямой экспорт в Хорошоп (${targetProducts.length} SKU)`,
      titleUk: `Прямий експорт в Хорошоп (${targetProducts.length} SKU)`,
      detailsRu: `Создано: ${totalCreated}, обновлено: ${totalUpdated}, пропущено: ${skippedCount}, ошибок: ${totalErrors} за ${durationMs}мс`,
      detailsUk: `Створено: ${totalCreated}, оновлено: ${totalUpdated}, пропущено: ${skippedCount}, помилок: ${totalErrors} за ${durationMs}мс`,
    });

    this.logger.log(
      `✅ [${tenantId}] Прямой экспорт завершен за ${durationMs}мс: создано ${totalCreated}, обновлено ${totalUpdated}, ошибок ${totalErrors}`,
    );

    return {
      success: totalErrors === 0 || totalCreated + totalUpdated > 0,
      totalFetched,
      totalExported: targetProducts.length,
      created: totalCreated,
      updated: totalUpdated,
      skipped: skippedCount,
      errors: totalErrors,
      durationMs,
    };
  }
}
