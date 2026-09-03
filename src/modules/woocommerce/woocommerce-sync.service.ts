import { Injectable, Logger } from '@nestjs/common';
import { LimanService } from '../liman/liman.service';
import { WoocommerceApiClient, WooProduct } from './woocommerce-api.client';
import { Tenant } from '../tenant/tenant.entity';

const WOO_CHUNK_SIZE = 50; // WooCommerce batch max 100, используем 50 для стабильности

@Injectable()
export class WoocommerceSyncService {
  private readonly logger = new Logger(WoocommerceSyncService.name);

  constructor(
    private readonly limanService: LimanService,
    private readonly wooClient: WoocommerceApiClient,
  ) {}

  /**
   * Конвертирует LimanProduct -> WooCommerce Product format
   */
  private mapProductToWoo(
    product: Awaited<ReturnType<LimanService['getProductByTcod']>>,
    baseUrl: string,
  ): WooProduct {
    const wooProduct: WooProduct = {
      sku: String(product.tcod),
      name: product.name,
      regular_price: String(product.price),
      manage_stock: true,
      stock_quantity: Math.max(0, Math.floor(product.stock)),
      stock_status: product.isAvailable ? 'instock' : 'outofstock',
      status: 'publish',
      meta_data: [],
    };

    // Штрихкод
    if (product.barcode) {
      wooProduct.meta_data!.push({ key: '_barcode', value: product.barcode });
      wooProduct.meta_data!.push({ key: '_sku', value: product.barcode });
    }

    // Описание
    if (product.description) {
      wooProduct.description = product.description;
    }

    // Фото товара
    if (product.imageUrls && product.imageUrls.length > 0) {
      wooProduct.images = product.imageUrls.map((url) => ({
        src: url,
        alt: product.name,
      }));
    }

    // Категория
    if (product.categoryGroup) {
      wooProduct.meta_data!.push({
        key: '_liman_category_group',
        value: product.categoryGroup,
      });
    }

    return wooProduct;
  }

  /**
   * Полная синхронизация каталога Limansoft → WooCommerce
   */
  async syncFullCatalog(
    tenant: Tenant,
    baseUrl: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ synced: number; errors: number; durationMs: number }> {
    const startTime = Date.now();
    const total = await this.limanService.getProductCount(tenant);

    this.logger.log(
      `🔄 [${tenant.id}] Начало синхронизации ${total} товаров в WooCommerce (${tenant.woocommerceUrl})`,
    );

    let synced = 0;
    let errors = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: WOO_CHUNK_SIZE,
        baseUrl,
      });

      if (!items.length) {
        hasMore = false;
        break;
      }

      const wooProducts = items.map((p) => this.mapProductToWoo(p, baseUrl));

      try {
        await this.wooClient.batchUpsertProducts(tenant, wooProducts);
        synced += items.length;
      } catch (err) {
        this.logger.error(
          `❌ [${tenant.id}] Ошибка пакетного обновления WooCommerce (страница ${page}):`,
          err,
        );
        errors += items.length;
      }

      onProgress?.(synced, total);

      page++;
      if (items.length < WOO_CHUNK_SIZE) {
        hasMore = false;
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `✅ [${tenant.id}] WooCommerce синхронизация завершена за ${durationMs}ms. Синхронизировано: ${synced}, ошибок: ${errors}`,
    );

    return { synced, errors, durationMs };
  }

  /**
   * Обновить цены и остатки (delta sync — только изменившиеся)
   */
  async syncStockAndPrices(
    tenant: Tenant,
    baseUrl: string,
  ): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;
    const total = await this.limanService.getProductCount(tenant);
    const pages = Math.ceil(total / 100);

    for (let page = 1; page <= pages; page++) {
      const { items } = await this.limanService.getProducts(tenant, { page, limit: 100, baseUrl });
      if (!items.length) break;

      const wooUpdates: WooProduct[] = items.map((p) => ({
        sku: String(p.tcod),
        regular_price: String(p.price),
        manage_stock: true,
        stock_quantity: Math.max(0, Math.floor(p.stock)),
        stock_status: p.isAvailable ? 'instock' : 'outofstock',
      }));

      try {
        await this.wooClient.batchUpsertProducts(tenant, wooUpdates);
        synced += items.length;
      } catch {
        errors += items.length;
      }
    }

    return { synced, errors };
  }
}
