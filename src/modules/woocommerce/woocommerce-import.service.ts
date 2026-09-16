import { Injectable, Logger, Optional } from '@nestjs/common';
import axios from 'axios';
import { LimanService } from '../liman/liman.service';
import { WoocommerceApiClient, WooProduct } from './woocommerce-api.client';
import { Tenant } from '../tenant/tenant.entity';
import { AlertService } from '../alert/alert.service';
import { ExternalProductUpsertDto } from '../liman/dto/liman-product.dto';

export interface SingleProductImportResult {
  success: boolean;
  productId?: number;
  tcod?: number;
  action?: 'created' | 'updated' | 'skipped';
  imagesCount?: number;
  skuUpdatedInWoo?: boolean;
  error?: string;
}

export interface BatchProductImportResult {
  totalProcessed: number;
  created: number;
  updated: number;
  errors: number;
  durationMs: number;
  items: Array<{ id?: number; tcod?: number; name?: string; action?: string }>;
  itemsTruncated?: boolean;
}

const MAX_IMAGES_PER_PRODUCT = 5;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 30000;

@Injectable()
export class WoocommerceImportService {
  private readonly logger = new Logger(WoocommerceImportService.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly wooClient: WoocommerceApiClient,
    @Optional() private readonly alertService?: AlertService,
  ) {}

  /**
   * Скачать фотографии товара по публичным URL из WooCommerce
   */
  private async downloadImages(
    images?: Array<{ src: string }>,
  ): Promise<Buffer[]> {
    if (!images || !images.length) return [];

    const buffers: Buffer[] = [];
    const targetImages = images.slice(0, MAX_IMAGES_PER_PRODUCT);

    for (const img of targetImages) {
      if (!img.src || !img.src.startsWith('http')) continue;
      try {
        const res = await axios.get<ArrayBuffer>(img.src, {
          responseType: 'arraybuffer',
          timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
        });
        if (res.data && res.data.byteLength > 0) {
          buffers.push(Buffer.from(res.data));
        }
      } catch (err) {
        this.logger.warn(
          `⚠️ Не удалось скачать фото ${img.src}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return buffers;
  }

  /**
   * Извлечь штрихкод из метаданных или SKU
   */
  private extractBarcode(wooProduct: WooProduct): string | undefined {
    if (wooProduct.meta_data && wooProduct.meta_data.length > 0) {
      for (const meta of wooProduct.meta_data) {
        const key = meta.key.toLowerCase();
        if (['_barcode', 'barcode', 'ean', 'gtin', 'upc'].includes(key)) {
          if (meta.value && String(meta.value).trim()) {
            return String(meta.value).trim();
          }
        }
      }
    }
    // Если SKU не числовой, но похож на штрихкод
    if (wooProduct.sku && /^\d{8,14}$/.test(wooProduct.sku.trim())) {
      return wooProduct.sku.trim();
    }
    return undefined;
  }

  /**
   * Импортировать один товар из WooCommerce в Limansoft MariaDB
   */
  async importProduct(
    tenant: Tenant,
    wooProduct: WooProduct,
  ): Promise<SingleProductImportResult> {
    const productId = wooProduct.id;
    const productName = (wooProduct.name || `Woo Product #${productId}`).trim();

    try {
      // 1. Скачиваем изображения
      const photos = await this.downloadImages(wooProduct.images);

      // 2. Извлекаем цену и остаток
      const rawPrice = wooProduct.regular_price || (wooProduct as any).price;
      const price = rawPrice ? parseFloat(String(rawPrice)) : undefined;
      const stock = wooProduct.manage_stock
        ? (wooProduct.stock_quantity ?? 0)
        : undefined;
      const categoryName = wooProduct.categories?.[0]?.name;
      const barcode = this.extractBarcode(wooProduct);

      // 3. Формируем DTO для LimanService
      const upsertData: ExternalProductUpsertDto = {
        sku: wooProduct.sku ? wooProduct.sku.trim() : undefined,
        barcode,
        name: productName,
        price: price !== undefined && !isNaN(price) ? price : 0,
        stock: stock !== undefined && !isNaN(stock) ? stock : 0,
        categoryName,
        description:
          wooProduct.description || wooProduct.short_description || undefined,
        photos,
      };

      // 4. Выполняем атомарный Upsert в MariaDB
      const result = await this.limanService.upsertProductFromExternal(
        tenant,
        upsertData,
      );

      // 5. Замыкаем цикл: если товар был новым без SKU или со строковым SKU — обновляем SKU в WooCommerce на полученный tcod
      let skuUpdated = false;
      const isNumericSku =
        wooProduct.sku && !isNaN(parseInt(wooProduct.sku, 10));
      if (
        productId &&
        (!wooProduct.sku ||
          !isNumericSku ||
          parseInt(wooProduct.sku, 10) !== result.tcod)
      ) {
        try {
          await this.wooClient.updateProductById(tenant, productId, {
            sku: String(result.tcod),
          });
          skuUpdated = true;
          this.logger.log(
            `🔗 [${tenant.id}] WooCommerce Product #${productId} обновлен SKU=${result.tcod}`,
          );
        } catch (updateErr) {
          this.logger.warn(
            `Не удалось обновить SKU в WooCommerce для #${productId}: ${updateErr instanceof Error ? updateErr.message : updateErr}`,
          );
        }
      }

      return {
        success: true,
        productId,
        tcod: result.tcod,
        action: result.action,
        imagesCount: photos.length,
        skuUpdatedInWoo: skuUpdated,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `❌ [${tenant.id}] Ошибка импорта товара #${productId} ("${productName}"):`,
        err,
      );

      void this.alertService?.sendCritical(
        'woocommerce',
        `Сбой импорта товара WooCommerce [${tenant.id}]`,
        `Не удалось импортировать товар #${productId} ("${productName}") в Limansoft MariaDB: ${errorMsg}`,
        err instanceof Error ? err.stack : undefined,
        tenant.id,
        { productId, productName },
      );

      return {
        success: false,
        productId,
        error: errorMsg,
      };
    }
  }

  /**
   * Импортировать товар по WooCommerce ID
   */
  async importProductById(
    tenant: Tenant,
    productId: number,
  ): Promise<SingleProductImportResult> {
    const wooProduct = await this.wooClient.getProductById(tenant, productId);
    if (!wooProduct) {
      return {
        success: false,
        productId,
        error: `Товар ID=${productId} не найден в WooCommerce`,
      };
    }
    return this.importProduct(tenant, wooProduct);
  }

  /**
   * Пакетный импорт товаров из WooCommerce в Limansoft (постранично)
   */
  async importAllProducts(
    tenant: Tenant,
    options?: {
      limit?: number;
      page?: number;
      onProgress?: (processed: number, total: number) => void;
    },
  ): Promise<BatchProductImportResult> {
    const startTime = Date.now();
    const targetLimit = options?.limit ?? 1000;
    let page = options?.page ?? 1;
    const perPage = 50;

    let totalProcessed = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;
    const items: Array<{
      id?: number;
      tcod?: number;
      name?: string;
      action?: string;
    }> = [];

    this.logger.log(
      `📥 [${tenant.id}] Старт пакетного импорта товаров из WooCommerce (${tenant.woocommerceUrl})`,
    );

    const MAX_REPORT_ITEMS = 200;
    let itemsTruncated = false;

    while (totalProcessed < targetLimit) {
      const remaining = targetLimit - totalProcessed;
      const chunkSize = Math.min(perPage, remaining);

      let products: WooProduct[] = [];
      try {
        products = await this.wooClient.getProducts(tenant, page, chunkSize);
      } catch (err) {
        this.logger.error(
          `Ошибка загрузки страницы ${page} из WooCommerce: ${err}`,
        );
        break;
      }

      if (!products || !products.length) {
        break; // Больше товаров нет
      }

      for (const product of products) {
        const res = await this.importProduct(tenant, product);
        totalProcessed++;

        if (res.success) {
          if (res.action === 'created') created++;
          else if (res.action === 'updated') updated++;

          if (items.length < MAX_REPORT_ITEMS) {
            items.push({
              id: product.id,
              tcod: res.tcod,
              name: product.name,
              action: res.action,
            });
          } else {
            itemsTruncated = true;
          }
        } else {
          errors++;
          if (items.length < MAX_REPORT_ITEMS) {
            items.push({
              id: product.id,
              name: product.name,
              action: 'error',
            });
          } else {
            itemsTruncated = true;
          }
        }

        options?.onProgress?.(totalProcessed, targetLimit);
        if (totalProcessed >= targetLimit) break;
      }

      if (products.length < chunkSize) {
        break;
      }
      page++;
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `🏁 [${tenant.id}] Импорт завершен за ${durationMs}ms: обработано ${totalProcessed}, создано ${created}, обновлено ${updated}, ошибок ${errors}`,
    );

    return {
      totalProcessed,
      created,
      updated,
      errors,
      durationMs,
      items,
      itemsTruncated,
    };
  }
}
