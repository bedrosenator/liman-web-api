import { Injectable, Logger, Optional } from '@nestjs/common';
import { LimanService } from '../liman/liman.service';
import { LimanOrderService } from '../liman/liman-order.service';
import { UnifiedIncomingOrderDto } from '../liman/dto/unified-order.dto';
import { ProductMappingService } from '../tenant/product-mapping.service';
import { TenantIntegration } from '../tenant/tenant-integration.entity';
import { WoocommerceApiClient, WooProduct } from './woocommerce-api.client';
import { Tenant } from '../tenant/tenant.entity';
import { AlertService } from '../alert/alert.service';

const WOO_CHUNK_SIZE = 50; // WooCommerce batch max 100, используем 50 для стабильности

export type SyncStatus = 'idle' | 'running' | 'completed' | 'error';

export type SyncPhase =
  'init' | 'checking_existing' | 'syncing' | 'completed' | 'error';

export interface SyncProgressState {
  tenantId: string;
  status: SyncStatus;
  phase?: SyncPhase;
  total: number;
  current: number;
  percent: number;
  synced: number;
  errors: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  message: string;
  error?: string;
}

/**
 * Сервис синхронизации каталога, цен и остатков между базой данных Limansoft и WooCommerce.
 *
 * Обеспечивает:
 * 1. Трансляцию моделей данных Limansoft (tcod, skl_k, namedesc) в спецификацию WooCommerce REST API.
 * 2. Полную выгрузку товаров пакетами по 50 позиций (`syncFullCatalog`).
 * 3. Быстрое дельта-обновление цен и остатков без повторной загрузки картинок (`syncStockAndPrices`).
 */
@Injectable()
export class WoocommerceSyncService {
  private readonly logger = new Logger(WoocommerceSyncService.name);
  private readonly syncStatusMap = new Map<string, SyncProgressState>();

  constructor(
    private readonly limanService: LimanService,
    private readonly wooClient: WoocommerceApiClient,
    @Optional() private readonly alertService?: AlertService,
    @Optional() private readonly limanOrderService?: LimanOrderService,
    @Optional() private readonly productMappingService?: ProductMappingService,
  ) {}

  /**
   * Получить текущий прогресс и статус синхронизации для тенанта
   */
  getSyncStatus(tenantId: string): SyncProgressState {
    const existing = this.syncStatusMap.get(tenantId);
    if (existing) {
      return existing;
    }
    return {
      tenantId,
      status: 'idle',
      total: 0,
      current: 0,
      percent: 0,
      synced: 0,
      errors: 0,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      message: 'Синхронізація ще не запускалася',
    };
  }

  /**
   * Преобразовать товар из формата Limansoft в объект WooCommerce Product.
   *
   * Маппинг:
   * - `sku` <= `product.tcod` (строковый код)
   * - `name` <= `product.name`
   * - `regular_price` <= `product.price`
   * - `stock_quantity` <= `product.stock`
   * - `manage_stock` <= `true`
   * - `images` <= массив ссылок Media API
   * - `_barcode` <= `product.barcode` в meta_data
   *
   * @param product Товар из базы Limansoft
   * @param baseUrl Базовый URL сервиса для ссылок на картинки
   * @returns Объект WooProduct
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
    options?: {
      limit?: number;
      onProgress?: (current: number, total: number) => void;
    },
  ): Promise<{ synced: number; errors: number; durationMs: number }> {
    const startTime = Date.now();
    const totalCount = await this.limanService.getProductCount(tenant);
    const targetTotal = options?.limit
      ? Math.min(options.limit, totalCount)
      : totalCount;

    const state: SyncProgressState = {
      tenantId: tenant.id,
      status: 'running',
      phase: 'init',
      total: targetTotal,
      current: 0,
      percent: 0,
      synced: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationMs: null,
      message: `Ініціалізація синхронізації (${targetTotal} товарів)...`,
    };
    this.syncStatusMap.set(tenant.id, state);

    this.logger.log(
      `🔄 [${tenant.id}] Начало синхронизации ${targetTotal} из ${totalCount} товаров в WooCommerce (${tenant.woocommerceUrl})`,
    );

    try {
      // Загружаем существующие SKU -> WooCommerce ID для предотвращения дубликатов
      state.phase = 'checking_existing';
      state.message = 'Перевірка існуючих товарів у WooCommerce...';
      const skuMap = await this.wooClient.getSkuToIdMap(tenant);

      let synced = 0;
      let errors = 0;
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const remaining = targetTotal - synced;
        const chunkSize = Math.min(WOO_CHUNK_SIZE, remaining);

        if (chunkSize <= 0) break;

        const { items } = await this.limanService.getProducts(tenant, {
          page,
          limit: chunkSize,
          baseUrl,
        });

        if (!items.length) {
          hasMore = false;
          break;
        }

        const wooProducts = items.map((p) => this.mapProductToWoo(p, baseUrl));

        try {
          await this.wooClient.batchUpsertProducts(tenant, wooProducts, skuMap);
          synced += items.length;
        } catch (err) {
          this.logger.error(
            `❌ [${tenant.id}] Ошибка пакетного обновления WooCommerce (страница ${page}):`,
            err,
          );
          errors += items.length;

          void this.alertService?.sendCritical(
            'woocommerce',
            `Сбой синхронизации WooCommerce [${tenant.id}]`,
            `Ошибка пакетного обновления товаров (стр. ${page}): ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
            tenant.id,
            {
              page,
              chunkSize: wooProducts.length,
              targetUrl: tenant.woocommerceUrl,
            },
          );
        }

        const processed = synced + errors;
        const pct =
          targetTotal > 0
            ? Math.min(100, Math.round((processed / targetTotal) * 100))
            : 100;
        state.phase = 'syncing';
        state.current = processed;
        state.synced = synced;
        state.errors = errors;
        state.percent = pct;
        state.message = `Синхронізовано ${synced} з ${targetTotal} (${pct}%)...`;

        options?.onProgress?.(synced, targetTotal);

        page++;
        if (items.length < chunkSize || synced >= targetTotal) {
          hasMore = false;
        }
      }

      const durationMs = Date.now() - startTime;
      state.status = 'completed';
      state.phase = 'completed';
      state.finishedAt = new Date().toISOString();
      state.durationMs = durationMs;
      state.percent = 100;
      state.current = targetTotal;
      const durationSec = Math.round(durationMs / 1000);
      state.message = `Синхронізацію успішно завершено! Оновлено: ${synced}, помилок: ${errors} за ${durationSec} сек.`;

      this.logger.log(
        `✅ [${tenant.id}] WooCommerce синхронизация завершена за ${durationMs}ms. Синхронизировано: ${synced}, ошибок: ${errors}`,
      );

      return { synced, errors, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      state.status = 'error';
      state.phase = 'error';
      state.finishedAt = new Date().toISOString();
      state.durationMs = durationMs;
      state.error = err instanceof Error ? err.message : String(err);
      state.message = `Помилка синхронізації: ${state.error}`;
      throw err;
    }
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
    const pages = Math.ceil(total / WOO_CHUNK_SIZE);

    const skuMap = await this.wooClient.getSkuToIdMap(tenant);

    for (let page = 1; page <= pages; page++) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: WOO_CHUNK_SIZE,
        baseUrl,
      });
      if (!items.length) break;

      const wooUpdates: WooProduct[] = items.map((p) => ({
        sku: String(p.tcod),
        regular_price: String(p.price),
        manage_stock: true,
        stock_quantity: Math.max(0, Math.floor(p.stock)),
        stock_status: p.isAvailable ? 'instock' : 'outofstock',
      }));

      try {
        await this.wooClient.batchUpsertProducts(tenant, wooUpdates, skuMap);
        synced += items.length;
      } catch {
        errors += items.length;
      }
    }

    return { synced, errors };
  }

  /**
   * Разрешить активную интеграцию WooCommerce в product_mappings
   */
  async resolveIntegration(
    tenantId: string,
    integrationId?: string,
  ): Promise<TenantIntegration | null> {
    if (!this.productMappingService) return null;
    return this.productMappingService.resolveActiveIntegration(
      tenantId,
      'woocommerce',
      integrationId,
    );
  }

  /**
   * Маппинг названия / кода доставки WooCommerce в стандартный код
   */
  mapDeliveryService(order: any): string | undefined {
    const shippingLines: any[] = order?.shipping_lines || [];
    const methodTitle =
      shippingLines[0]?.method_title ||
      shippingLines[0]?.method_id ||
      order?.shipping_method ||
      '';
    if (!methodTitle) return undefined;

    const t = String(methodTitle).toLowerCase();
    if (
      t.includes('нова пошта') ||
      t.includes('nova poshta') ||
      t.includes('np') ||
      t.includes('novaposhta')
    ) {
      return 'nova_poshta';
    }
    if (t.includes('укрпошта') || t.includes('ukrposhta')) {
      return 'ukrposhta';
    }
    if (
      t.includes('самовивіз') ||
      t.includes('самовывоз') ||
      t.includes('pickup') ||
      t.includes('local_pickup')
    ) {
      return 'selfpickup';
    }
    if (t.includes('кур') || t.includes('courier')) {
      return 'courier';
    }
    return 'other';
  }

  /**
   * Преобразовать входящий заказ WooCommerce (Webhook или REST API)
   * в унифицированный объект UnifiedIncomingOrderDto (ACL)
   */
  mapWooOrderToUnifiedDto(order: any): UnifiedIncomingOrderDto {
    const orderId = String(order?.id || order?.order_id || 'N/A');
    const rawLineItems: any[] = order?.line_items || order?.products || [];

    const customerName =
      [order?.billing?.first_name, order?.billing?.last_name].filter(Boolean).join(' ') ||
      [order?.shipping?.first_name, order?.shipping?.last_name].filter(Boolean).join(' ') ||
      order?.customer_name ||
      undefined;

    const customerPhone =
      order?.billing?.phone ||
      order?.shipping?.phone ||
      order?.phone ||
      undefined;

    const deliveryAddress =
      [order?.shipping?.address_1, order?.shipping?.city, order?.shipping?.state, order?.shipping?.postcode]
        .filter(Boolean)
        .join(', ') ||
      [order?.billing?.address_1, order?.billing?.city].filter(Boolean).join(', ') ||
      undefined;

    const deliveryWarehouse =
      order?.shipping?.address_2 ||
      order?.billing?.address_2 ||
      undefined;

    const lineItems = rawLineItems
      .map((item: any) => ({
        externalArticle: String(item.sku || item.product_id || item.id || '').trim(),
        name: item.name || item.title || undefined,
        quantity: Number(item.quantity ?? item.count ?? 1),
        price: Number(item.price ?? 0),
        discount:
          item.total && item.subtotal && Number(item.subtotal) > Number(item.total)
            ? Number(item.subtotal) - Number(item.total)
            : undefined,
      }))
      .filter((li) => li.externalArticle && li.quantity > 0);

    return {
      source: 'woocommerce',
      externalOrderId: orderId,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryService: this.mapDeliveryService(order),
      deliveryWarehouse,
      paymentMethod:
        order?.payment_method_title ||
        order?.payment_method ||
        undefined,
      totalAmount: order?.total ? Number(order.total) : undefined,
      currency: order?.currency || 'UAH',
      lineItems,
      rawPayload: order,
    };
  }

  /**
   * Опрос новых заказов из WooCommerce (Polling) с автоматическим списанием остатков
   */
  async syncOrders(
    tenant: Tenant,
    options: { status?: string; perPage?: number } = {},
  ): Promise<{
    totalFetched: number;
    processedOrders: number;
    skippedOrders: number;
    itemsDeducted: Array<{
      orderId: string | number;
      tcod: number;
      qty: number;
      oldStock: number;
      newStock: number;
    }>;
  }> {
    if (!this.limanOrderService) {
      throw new Error('LimanOrderService не внедрен в WoocommerceSyncService');
    }

    const statusFilter = options.status || 'processing';
    this.logger.log(
      `📥 [${tenant.id}] Опрос заказов WooCommerce (статус: ${statusFilter})...`,
    );

    const orders = await this.wooClient.getOrders(
      tenant,
      statusFilter,
      options.perPage || 50,
    );

    const integration = await this.resolveIntegration(tenant.id);

    let processedOrders = 0;
    let skippedOrders = 0;
    const itemsDeducted: Array<{
      orderId: string | number;
      tcod: number;
      qty: number;
      oldStock: number;
      newStock: number;
    }> = [];

    for (const order of orders) {
      const orderId = String(order.id || (order as any).order_id);
      if (!orderId) continue;

      if (!this.limanOrderService.markOrderProcessed(tenant.id, 'woocommerce', orderId)) {
        this.logger.log(
          `⏭️ [${tenant.id}] Заказ WooCommerce №${orderId} уже был обработан ранее. Пропускаем.`,
        );
        skippedOrders++;
        continue;
      }

      const dto = this.mapWooOrderToUnifiedDto(order);

      const result = await this.limanOrderService.processIncomingOrder(
        tenant,
        dto,
        integration?.id || null,
      );

      for (const deducted of result.deductedItems) {
        itemsDeducted.push({
          orderId,
          tcod: deducted.tcod,
          qty: deducted.qty,
          oldStock: deducted.oldStock,
          newStock: deducted.newStock,
        });
      }

      processedOrders++;
    }

    this.logger.log(
      `✅ [${tenant.id}] Опрос заказов WooCommerce завершен: получено ${orders.length}, ` +
        `обработано ${processedOrders}, пропущено (дубли) ${skippedOrders}, списано позиций ${itemsDeducted.length}`,
    );

    return {
      totalFetched: orders.length,
      processedOrders,
      skippedOrders,
      itemsDeducted,
    };
  }
}
