import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  ExportPromCatalogJobData,
} from '../queue/queue.constants';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import {
  PromApiClient,
  PromProductEditItem,
  PromGroup,
} from './prom-api.client';
import { PromSyncService } from './prom-sync.service';
import { AlertService } from '../alert/alert.service';
import { ProductMappingService } from '../tenant/product-mapping.service';
import { Tenant } from '../tenant/tenant.entity';
import { LimanProductDto } from '../liman/dto/liman-product.dto';

const EXPORT_BATCH_SIZE = 50;
const THROTTLE_DELAY_MS = 250;
const FETCH_BATCH_SIZE = 500;

export interface PromExportResult {
  success: boolean;
  totalFetched: number;
  totalExported: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
  errorDetails?: Array<{ article: string; message: string }>;
}

/**
 * Воркер фоновой очереди BullMQ для прямого экспорта каталога:
 * Limansoft MariaDB -> Prom.ua
 */
@Processor(QUEUE_NAMES.EXPORT_PROM_CATALOG)
export class PromExportProcessor extends WorkerHost {
  private readonly logger = new Logger(PromExportProcessor.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
    private readonly promClient: PromApiClient,
    private readonly promSyncService: PromSyncService,
    @Optional() private readonly productMappingService?: ProductMappingService,
    @Optional() private readonly alertService?: AlertService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    super();
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async resolveIntegration(tenant: Tenant, integrationId?: string) {
    if (!this.productMappingService) return null;
    return this.promSyncService.resolveIntegration(tenant.id, integrationId);
  }

  private filterProductsByMode(
    products: LimanProductDto[],
    mappedTcods: Set<number>,
    mode: 'only_new' | 'update_existing' | 'full_overwrite',
  ): { targetProducts: LimanProductDto[]; skippedCount: number } {
    if (mode === 'full_overwrite') {
      return { targetProducts: products, skippedCount: 0 };
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
   * Формирование элемента товара для Prom API
   */
  private buildProductItem(
    product: LimanProductDto,
    categoryName: string | undefined,
    options: ExportPromCatalogJobData,
    promGroupMap?: Map<string, number>,
  ): PromProductEditItem {
    const item: PromProductEditItem = {
      external_id: String(product.tcod),
      name: product.name,
    };

    if (options.exportPrices !== false) {
      item.price = product.price;
    }

    if (options.exportStock !== false) {
      item.quantity_in_stock = Math.max(0, product.stock);
      item.presence = product.stock > 0 ? 'available' : 'not_available';
    }

    if (product.barcode) {
      item.sku = product.barcode;
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

    if (options.exportCategories !== false) {
      let targetGroupId: number | undefined = undefined;
      if (categoryName && promGroupMap) {
        const lowerCat = categoryName.trim().toLowerCase();
        if (promGroupMap.has(lowerCat)) {
          targetGroupId = promGroupMap.get(lowerCat);
        }
      }
      if (!targetGroupId && options.defaultGroupId) {
        targetGroupId = options.defaultGroupId;
      }
      if (targetGroupId) {
        item.category_id = targetGroupId;
      }
    }

    return item;
  }

  async process(
    job: Job<ExportPromCatalogJobData>,
  ): Promise<PromExportResult> {
    const startTime = Date.now();
    const {
      tenantId,
      integrationId,
      mode = 'full_overwrite',
      limit,
    } = job.data;

    this.logger.log(
      `🚀 [${tenantId}] Запуск прямого экспорта каталога в Prom.ua (режим: ${mode})`,
    );

    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.promApiKey) {
      throw new Error(`У тенанта "${tenantId}" не настроен promApiKey`);
    }

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

    const baseUrl =
      job.data.baseUrl ||
      tenant.publicBaseUrl ||
      this.configService?.get<string>('publicBaseUrl') ||
      process.env.PUBLIC_BASE_URL ||
      'http://localhost:3000';

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
        baseUrl,
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

    // 2. Фильтрация по режиму через product_mappings
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

    // 3. Загрузка групп Prom для сопоставления категорий
    await job.updateProgress(20);
    const promGroupMap = new Map<string, number>();
    try {
      const groups = await this.promClient.getGroups(tenant.promApiKey);
      for (const g of groups) {
        if (g.name) {
          promGroupMap.set(g.name.trim().toLowerCase(), g.id);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Не удалось загрузить группы Prom.ua: ${err.message}`);
    }

    // 4. Пакетная отправка товаров в Prom.ua
    let totalExported = 0;
    let errors = 0;
    const errorDetails: Array<{ article: string; message: string }> = [];

    const totalToExport = targetProducts.length;
    const chunks: LimanProductDto[][] = [];
    for (let i = 0; i < targetProducts.length; i += EXPORT_BATCH_SIZE) {
      chunks.push(targetProducts.slice(i, i + EXPORT_BATCH_SIZE));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const payload: PromProductEditItem[] = chunk.map((product) => {
        const catName = product.categoryGroup
          ? categoryMap.get(product.categoryGroup)
          : undefined;
        return this.buildProductItem(
          product,
          catName,
          job.data,
          promGroupMap,
        );
      });

      try {
        const res = await this.promClient.editProducts(
          tenant.promApiKey,
          payload,
        );
        totalExported += res.processed;

        // Сохранение связей в product_mappings
        if (this.productMappingService && currentIntegrationId) {
          const mappingItems = chunk.map((p) => ({
            tenantId: tenant.id,
            integrationId: currentIntegrationId,
            limanTcod: p.tcod,
            externalArticle: String(p.tcod),
            limanBarcode: p.barcode || null,
            limanArticul: p.barcode || null,
            syncStatus: 'synced' as const,
            metadata: {
              name: p.name,
              price: p.price,
              stock: p.stock,
              exportedAt: new Date().toISOString(),
            },
          }));
          await this.productMappingService.saveBatchMappings(mappingItems);
        }
      } catch (chunkErr: any) {
        errors += chunk.length;
        errorDetails.push({
          article: chunk.map((c) => c.tcod).join(','),
          message: chunkErr.message,
        });
        this.logger.error(
          `❌ [${tenantId}] Ошибка экспорта чанка ${i + 1}/${chunks.length}: ${chunkErr.message}`,
        );
      }

      const progressPercent = Math.min(
        98,
        Math.round(((i + 1) / chunks.length) * 75) + 20,
      );
      await job.updateProgress(progressPercent);

      if (i < chunks.length - 1) {
        await this.sleep(THROTTLE_DELAY_MS);
      }
    }

    await job.updateProgress(100);

    const isSuccess = errors === 0;
    this.promSyncService.addActivity(tenantId, {
      type: 'sync',
      status: isSuccess ? 'success' : 'warning',
      titleRu: `Экспорт каталога в Prom.ua: ${totalExported} товаров`,
      titleUk: `Експорт каталогу в Prom.ua: ${totalExported} товарів`,
      detailsRu: `Успешно выгружено: ${totalExported}, пропущено: ${skippedCount}, ошибок: ${errors}`,
      detailsUk: `Успішно вивантажено: ${totalExported}, пропущено: ${skippedCount}, помилок: ${errors}`,
    });

    return {
      success: isSuccess,
      totalFetched,
      totalExported,
      created: mode === 'only_new' ? totalExported : 0,
      updated: mode !== 'only_new' ? totalExported : 0,
      skipped: skippedCount,
      errors,
      durationMs: Date.now() - startTime,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    };
  }
}
