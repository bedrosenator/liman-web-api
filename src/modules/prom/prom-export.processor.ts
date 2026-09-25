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
import { PromApiClient } from './prom-api.client';
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
  pendingFeedCount?: number;
  durationMs: number;
  errorDetails?: Array<{ article: string; message: string }>;
  message?: string;
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

    // 3. Пакетная отправка товаров в Prom.ua
    await job.updateProgress(20);
    let totalExported = 0;
    let errors = 0;
    let notFoundErrors = 0;
    const errorDetails: Array<{ article: string; message: string }> = [];

    const totalToExport = targetProducts.length;
    const chunks: LimanProductDto[][] = [];
    for (let i = 0; i < targetProducts.length; i += EXPORT_BATCH_SIZE) {
      chunks.push(targetProducts.slice(i, i + EXPORT_BATCH_SIZE));
    }

    const feedUrl = `${baseUrl}/api/v1/prom/${tenant.id}/feed.xml`;

    const isLocalBaseUrl =
      baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

    // Попытка зарегистрировать / обновить YML-фид в Prom.ua для создания новых товаров
    let feedImportError: string | null = null;
    if (isLocalBaseUrl) {
      feedImportError =
        'Локальный адрес (localhost): для автоматического импорта в Prom.ua запустите туннель (npm run tunnel) или укажите PUBLIC_BASE_URL в настройках.';
      this.logger.warn(`⚠️ [${tenantId}] ${feedImportError}`);
    } else {
      try {
        await this.promClient.importUrl(tenant.promApiKey, {
          url: feedUrl,
          force_update: true,
          updated_fields: [
            'name',
            'sku',
            'price',
            'images_urls',
            'presence',
            'quantity_in_stock',
            'description',
            'group',
          ],
        });
        this.logger.log(`📥 [${tenantId}] Запрос на импорт фида ${feedUrl} отправлен в Prom.ua`);
      } catch (feedErr: any) {
        feedImportError =
          feedErr.response?.data?.error?.message ||
          feedErr.response?.data?.message ||
          feedErr.message;
        this.logger.warn(`⚠️ [${tenantId}] Запуск import_url фида в Prom.ua: ${feedImportError}`);
      }
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const itemsToEdit = chunk.map((product) => {
        const hasValidPrice =
          product.price !== undefined &&
          product.price !== null &&
          product.price > 0;

        const item: {
          id: string;
          name?: string;
          price?: number;
          presence?: 'available' | 'not_available' | 'order';
          quantity_in_stock?: number;
          description?: string;
        } = {
          id: String(product.tcod),
          name: product.name,
        };

        if (job.data.exportPrices !== false && hasValidPrice) {
          item.price = Number(product.price.toFixed(2));
        }

        if (job.data.exportStock !== false) {
          item.quantity_in_stock = Math.max(0, product.stock);
          item.presence =
            product.stock > 0 && hasValidPrice ? 'available' : 'not_available';
        }

        if (job.data.exportDescriptions !== false && product.description) {
          item.description = product.description;
        }

        return item;
      });

      try {
        const res = await this.promClient.editProductsByExternalId(
          tenant.promApiKey,
          itemsToEdit,
        );
        totalExported += res.processed;

        if (res.errors && typeof res.errors === 'object') {
          const chunkErrors = Object.keys(res.errors).length;
          errors += chunkErrors;
          for (const [art, err] of Object.entries(res.errors)) {
            let msg = '';
            if (typeof err === 'object' && err !== null) {
              msg = Object.entries(err)
                .map(([field, val]) => `${field}: ${Array.isArray(val) ? val.join(', ') : val}`)
                .join('; ');
            } else {
              msg = String(err);
            }

            if (
              msg.toLowerCase().includes('не найден') ||
              msg.toLowerCase().includes('not found')
            ) {
              notFoundErrors++;
            }

            if (errorDetails.length < 50) {
              errorDetails.push({
                article: art,
                message: msg,
              });
            }
          }
        }

        // Сохранение связей в product_mappings ТОЛЬКО для успешно обновленных товаров
        if (
          this.productMappingService &&
          currentIntegrationId &&
          res.processedIds &&
          res.processedIds.length > 0
        ) {
          const processedSet = new Set(res.processedIds.map(String));
          const mappedChunk = chunk.filter((p) =>
            processedSet.has(String(p.tcod)),
          );
          if (mappedChunk.length > 0) {
            const mappingItems = mappedChunk.map((p) => ({
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

    const isSuccess = totalExported > 0 && errors === 0;

    let userMessage: string | undefined = undefined;
    if (totalExported === 0 && totalToExport > 0) {
      const feedNotice = feedImportError
        ? ` Prom.ua отклонил импорт фида: "${feedImportError}".`
        : '';
      if (notFoundErrors > 0 || errors === 0) {
        userMessage = `Товары еще не созданы в Prom.ua.${feedNotice} Зарегистрируйте YML-фид (${feedUrl}) в кабинете продавца Prom.ua (Товары и услуги → Импорт).`;
        this.promSyncService.addActivity(tenantId, {
          type: 'sync',
          status: 'warning',
          titleRu: `Экспорт в Prom.ua: товары не найдены в каталоге`,
          titleUk: `Експорт у Prom.ua: товари не знайдені в каталозі`,
          detailsRu: `0 из ${totalToExport} товаров обновлено.${feedNotice} В Prom.ua новые товары создаются через импорт YML-фида: ${feedUrl}`,
          detailsUk: `0 з ${totalToExport} товарів оновлено.${feedNotice} У Prom.ua нові товари створюються через імпорт YML-фіда: ${feedUrl}`,
        });
      } else {
        userMessage = `Замечания Prom.ua к товарам (ошибок: ${errors}). См. детали ниже.`;
        this.promSyncService.addActivity(tenantId, {
          type: 'sync',
          status: 'warning',
          titleRu: `Экспорт в Prom.ua: ошибки валидации (${errors})`,
          titleUk: `Експорт у Prom.ua: помилки валідації (${errors})`,
          detailsRu: `0 из ${totalToExport} товаров обновлено. Обнаружены замечания к данным по ${errors} позициям.`,
          detailsUk: `0 з ${totalToExport} товарів оновлено. Виявлено зауваження до даних за ${errors} позиціями.`,
        });
      }
    } else {
      const dataErrors = Math.max(0, errors - notFoundErrors);
      if (notFoundErrors > 0) {
        userMessage = `Обновлено: ${totalExported}. Ожидают импорта через YML-фид: ${notFoundErrors}${dataErrors > 0 ? `, ошибок данных: ${dataErrors}` : ''}.`;
        this.promSyncService.addActivity(tenantId, {
          type: 'sync',
          status: 'warning',
          titleRu: `Экспорт в Prom.ua: обновлено ${totalExported}, ожидают фид ${notFoundErrors}`,
          titleUk: `Експорт у Prom.ua: оновлено ${totalExported}, очікують фід ${notFoundErrors}`,
          detailsRu: `Обновлено: ${totalExported} из ${totalToExport}. Новые товары (${notFoundErrors}) создаются через импорт YML-фида: ${feedUrl}`,
          detailsUk: `Оновлено: ${totalExported} з ${totalToExport}. Нові товари (${notFoundErrors}) створюються через імпорт YML-фіда: ${feedUrl}`,
        });
      } else {
        userMessage = `Успешно выгружено: ${totalExported}, пропущено: ${skippedCount}, ошибок: ${errors}`;
        this.promSyncService.addActivity(tenantId, {
          type: 'sync',
          status: isSuccess ? 'success' : 'warning',
          titleRu: `Экспорт каталога в Prom.ua: ${totalExported} товаров`,
          titleUk: `Експорт каталогу в Prom.ua: ${totalExported} товарів`,
          detailsRu: `Успешно выгружено: ${totalExported}, пропущено: ${skippedCount}, ошибок: ${errors}`,
          detailsUk: `Успішно вивантажено: ${totalExported}, пропущено: ${skippedCount}, помилок: ${errors}`,
        });
      }
    }

    return {
      success: isSuccess,
      totalFetched,
      totalExported,
      created: 0,
      updated: totalExported,
      skipped: skippedCount,
      errors: totalExported === 0 && totalToExport > 0 ? totalToExport : errors,
      pendingFeedCount: notFoundErrors > 0 ? notFoundErrors : undefined,
      durationMs: Date.now() - startTime,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      message: userMessage,
    };
  }
}
