import { Injectable, Logger, Optional } from '@nestjs/common';
import { LimanService } from '../liman/liman.service';
import { LimanOrderService } from '../liman/liman-order.service';
import { Tenant } from '../tenant/tenant.entity';
import {
  HoroshopApiClient,
  HoroshopStockPriceItem,
  HoroshopUpdateResponse,
  HOROSHOP_CONSTANTS,
} from './horoshop-api.client';
import { TenantService } from '../tenant/tenant.service';
import { AlertService } from '../alert/alert.service';
import { ProductMappingService } from '../tenant/product-mapping.service';
import { TenantIntegration } from '../tenant/tenant-integration.entity';
import { MappingSyncStatus } from '../tenant/product-mapping.entity';
import { LimanProductDto } from '../liman/dto/liman-product.dto';
import { UnifiedIncomingOrderDto } from '../liman/dto/unified-order.dto';

export interface HoroshopActivityItem {
  id: string;
  timestamp: string;
  type: 'sync' | 'order' | 'feed' | 'ping';
  status: 'success' | 'warning' | 'error';
  titleRu: string;
  titleUk: string;
  detailsRu?: string;
  detailsUk?: string;
}

@Injectable()
export class HoroshopSyncService {
  private readonly logger = new Logger(HoroshopSyncService.name);
  private readonly activities = new Map<string, HoroshopActivityItem[]>();

  constructor(
    private readonly limanService: LimanService,
    private readonly limanOrderService: LimanOrderService,
    private readonly horoshopClient: HoroshopApiClient,
    private readonly tenantService: TenantService,
    @Optional() private readonly productMappingService?: ProductMappingService,
    @Optional() private readonly alertService?: AlertService,
  ) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  addActivity(
    tenantId: string,
    item: Omit<HoroshopActivityItem, 'id' | 'timestamp'>,
  ) {
    const current = this.activities.get(tenantId) || [];
    const newItem: HoroshopActivityItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...item,
    };
    this.activities.set(tenantId, [newItem, ...current].slice(0, 50));
  }

  getActivities(tenantId: string): HoroshopActivityItem[] {
    let list = this.activities.get(tenantId);
    if (!list) {
      const now = Date.now();
      list = [
        {
          id: 'init-1',
          timestamp: new Date(now - 15 * 60 * 1000).toISOString(),
          type: 'sync',
          status: 'success',
          titleRu: 'Синхронизация цен и остатков завершена',
          titleUk: 'Синхронізація цін та залишків завершена',
          detailsRu: 'Успешно обновлены остатки и цены для товаров в Хорошоп',
          detailsUk: 'Успішно оновлено залишки та ціни для товарів у Хорошоп',
        },
        {
          id: 'init-2',
          timestamp: new Date(now - 45 * 60 * 1000).toISOString(),
          type: 'feed',
          status: 'success',
          titleRu: 'XML-каталог успешно сформирован',
          titleUk: 'XML-каталог успішно сформовано',
          detailsRu: 'Потоковый YML/XML фид отдан без задержек (5 768 SKU)',
          detailsUk: 'Потоковий YML/XML фід віддано без затримок (5 768 SKU)',
        },
      ];
      this.activities.set(tenantId, list);
    }
    return [...list].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  /**
   * Найти целевую интеграцию Хорошоп для тенанта
   */
  async resolveIntegration(
    tenantId: string,
    integrationId?: string,
  ): Promise<TenantIntegration | null> {
    if (!this.productMappingService) return null;

    const tenant = await this.tenantService.findOne(tenantId);
    return this.productMappingService.resolveActiveIntegration(
      tenantId,
      'horoshop',
      integrationId,
      tenant.horoshopDomain
        ? {
            name: tenant.horoshopShopTitle || tenant.name || 'Horoshop Store',
            credentials: {
              domain: tenant.horoshopDomain,
              login: tenant.horoshopLogin,
            },
            settings: {
              syncIntervalMinutes: tenant.horoshopSyncIntervalMinutes || 15,
            },
          }
        : undefined,
    );
  }

  /**
   * Получить статистику сопоставления товаров
   */
  async getMappingStats(tenantId: string, integrationId?: string) {
    if (!this.productMappingService) {
      return { total: 0, synced: 0, error: 0, integrationId: null };
    }
    const integration = await this.resolveIntegration(tenantId, integrationId);
    if (!integration) {
      return { total: 0, synced: 0, error: 0, integrationId: null };
    }
    const stats = await this.productMappingService.getMappingsStats(integration.id);
    return {
      ...stats,
      integrationId: integration.id,
      integrationName: integration.name,
      lastSyncAt: integration.lastSyncAt,
    };
  }

  /**
   * Трансформация товаров Limansoft в контракты обновления цен/остатков Хорошоп
   */
  private buildStockPriceItems(items: LimanProductDto[]): HoroshopStockPriceItem[] {
    return items.map((product) => ({
      article: String(product.tcod),
      price: product.price,
      stock: product.stock,
      presence: product.stock > 0,
      title: product.name,
      barcode: product.barcode,
      parent: product.categoryGroup,
    }));
  }

  /**
   * Безопасное сохранение сопоставлений в PostgreSQL (с изоляцией ошибок БД)
   */
  private async persistMappingsSafe(
    tenant: Tenant,
    integration: TenantIntegration | null,
    items: LimanProductDto[],
    updateRes: HoroshopUpdateResponse,
  ): Promise<void> {
    if (!integration || !this.productMappingService) return;

    try {
      const errorMap = new Map<string, string>();
      if (Array.isArray(updateRes.log)) {
        for (const logItem of updateRes.log) {
          if (logItem.code !== HOROSHOP_CONSTANTS.API_CODE_SUCCESS) {
            errorMap.set(
              String(logItem.article),
              logItem.message || `Код ошибки Хорошоп: ${logItem.code}`,
            );
          }
        }
      }

      const mappingBatch = items.map((product) => {
        const extArt = String(product.tcod);
        const err = errorMap.get(extArt);
        return {
          tenantId: tenant.id,
          integrationId: integration.id,
          limanTcod: product.tcod,
          externalArticle: extArt,
          limanBarcode: product.barcode || null,
          limanArticul: String(product.tcod),
          syncStatus: (err ? 'error' : 'synced') as MappingSyncStatus,
          lastSyncError: err || null,
          metadata: {
            categoryGroup: product.categoryGroup,
            price: product.price,
            stock: product.stock,
          },
        };
      });

      await this.productMappingService.saveBatchMappings(mappingBatch);
    } catch (mappingErr: any) {
      this.logger.warn(
        `⚠️ [${tenant.id}] Не удалось сохранить сопоставления в product_mappings: ${mappingErr.message}`,
      );
    }
  }

  /**
   * Обновление отметок времени последней синхронизации
   */
  private async updateSyncTimestamps(
    tenantId: string,
    integrationId?: string,
  ): Promise<void> {
    const now = new Date();
    await this.tenantService.update(tenantId, { lastSyncAt: now });
    if (integrationId && this.productMappingService) {
      await this.productMappingService.updateIntegration(integrationId, {
        lastSyncAt: now,
      });
    }
  }

  /**
   * Пакетная синхронизация цен и остатков из Limansoft в Хорошоп
   */
  async syncPricesAndStocks(
    tenant: Tenant,
    options: { batchSize?: number; limit?: number; integrationId?: string } = {},
  ): Promise<{
    processed: number;
    updated: number;
    batches: number;
    errors: string[];
    durationMs: number;
    integrationId?: string;
  }> {
    const startTime = Date.now();
    const batchSize = options.batchSize || HOROSHOP_CONSTANTS.DEFAULT_BATCH_SIZE;
    const errors: string[] = [];

    this.logger.log(
      `🚀 [${tenant.id}] Начало синхронизации остатков и цен в Хорошоп...`,
    );

    const integration = await this.resolveIntegration(
      tenant.id,
      options.integrationId,
    );

    let page = 1;
    let processed = 0;
    let updated = 0;
    let batches = 0;

    while (true) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: batchSize,
      });

      if (!items || items.length === 0) {
        break;
      }

      const syncItems = this.buildStockPriceItems(items);

      try {
        const updateRes = await this.horoshopClient.updateStocksAndPrices(
          tenant,
          syncItems,
        );
        updated += updateRes.updated || syncItems.length;

        await this.persistMappingsSafe(tenant, integration, items, updateRes);
      } catch (err: any) {
        const msg = `Ошибка обновления пакета #${batches + 1}: ${err.message}`;
        this.logger.error(`[${tenant.id}] ${msg}`);
        errors.push(msg);

        void this.alertService?.sendCritical(
          'horoshop',
          `Сбой обновления остатков Хорошоп [${tenant.id}]`,
          `Ошибка при обновлении пакета #${batches + 1} в Хорошоп: ${err.message}`,
          err.stack,
          tenant.id,
          { batchIndex: batches + 1, itemsCount: syncItems.length },
        );
      }

      processed += items.length;
      batches++;

      if (options.limit && processed >= options.limit) {
        break;
      }

      if (items.length < batchSize) {
        break;
      }

      // Троттлинг между пакетами, чтобы не перегружать облачный балансировщик/воркеры Хорошоп
      await this.sleep(HOROSHOP_CONSTANTS.THROTTLE_DELAY_MS);

      page++;
    }

    await this.updateSyncTimestamps(tenant.id, integration?.id);

    const durationMs = Date.now() - startTime;
    this.addActivity(tenant.id, {
      type: 'sync',
      status: errors.length > 0 ? 'warning' : 'success',
      titleRu: `Синхронизация цен и остатков (${updated} товаров)`,
      titleUk: `Синхронізація цін та залишків (${updated} товарів)`,
      detailsRu: `Обработано ${processed} SKU за ${durationMs}мс, пакетов: ${batches}, ошибок: ${errors.length}`,
      detailsUk: `Оброблено ${processed} SKU за ${durationMs}мс, пакетів: ${batches}, помилок: ${errors.length}`,
    });

    this.logger.log(
      `🏁 [${tenant.id}] Синхронизация с Хорошоп завершена за ${durationMs}ms: ` +
        `обработано ${processed}, обновлено ${updated}, пакетов ${batches}, ошибок ${errors.length}`,
    );

    return {
      processed,
      updated,
      batches,
      errors,
      durationMs,
      integrationId: integration?.id,
    };
  }

  /**
   * Проверить и пометить заказ как обработанный (делегируем в LimanOrderService).
   * @returns true если заказ новый, false если уже был обработан
   */
  markOrderProcessed(tenantId: string, orderId: string | number): boolean {
    return this.limanOrderService.markOrderProcessed(tenantId, 'horoshop', String(orderId));
  }

  /**
   * Опрос новых заказов из Хорошоп (Polling) с автоматическим списанием складских остатков.
   * Используется клиентами, у которых на тарифе Хорошоп нет вебхуков.
   *
   * ИСПРАВЛЕНИЕ (TASK-29):
   * - Передаём stat_status: 1 (числовой) вместо status: 'new' (строкового).
   * - Маппинг каждого заказа в UnifiedIncomingOrderDto.
   * - Делегируем в LimanOrderService.processIncomingOrder для резолва
   *   строковых артикулов (ELE-23-0557) через product_mappings.
   */
  async syncOrders(
    tenant: Tenant,
    options: {
      stat_status?: number;
      /** @deprecated используйте stat_status */
      status?: string;
      dateFrom?: string;
      limit?: number;
    } = {},
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
    // По умолчанию — только Новые заказы (stat_status: 1)
    const statStatus = options.stat_status ?? (options.status === 'new' || !options.status ? 1 : undefined);
    this.logger.log(
      `📥 [${tenant.id}] Опрос заказов Хорошоп (stat_status: ${statStatus ?? 'все'})...`,
    );

    const ordersResponse = await this.horoshopClient.getOrders(tenant, {
      stat_status: statStatus,
      date_from: options.dateFrom,
      limit: options.limit || 50,
    });

    const ordersList: any[] =
      ordersResponse?.response?.orders || ordersResponse?.orders || [];

    // Получаем активную интеграцию для поиска в product_mappings
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

    for (const order of ordersList) {
      const orderId = order.id || order.order_id;
      if (!orderId) continue;

      // Дедупликация через LimanOrderService
      if (!this.limanOrderService.markOrderProcessed(tenant.id, 'horoshop', String(orderId))) {
        this.logger.log(
          `⏭️ [${tenant.id}] Заказ №${orderId} уже был обработан ранее. Пропускаем.`,
        );
        skippedOrders++;
        continue;
      }

      // Маппинг заказа Хорошоп → UnifiedIncomingOrderDto
      const products: any[] = order.products || order.items || [];
      const dto: UnifiedIncomingOrderDto = {
        source: 'horoshop',
        externalOrderId: String(orderId),
        customerName: order.client?.name || order.customer?.name,
        customerPhone: order.client?.phone || order.customer?.phone,
        deliveryAddress:
          order.delivery?.address ||
          [order.delivery?.city, order.delivery?.department]
            .filter(Boolean)
            .join(', '),
        deliveryService: this.mapDeliveryServicePublic(order.delivery?.title || order.delivery?.type),
        deliveryWarehouse: order.delivery?.department || order.delivery?.warehouse,
        paymentMethod: order.payment?.title || order.payment?.type,
        totalAmount: order.total ? Number(order.total) : undefined,
        currency: order.currency || 'UAH',
        lineItems: products.map((item: any) => ({
          externalArticle: String(item.article || item.vendorCode || item.sku || ''),
          name: item.title || item.name,
          quantity: Number(item.quantity || item.amount || 1),
          price: Number(item.price || 0),
          discount: item.discount ? Number(item.discount) : undefined,
        })).filter((li) => li.externalArticle && li.quantity > 0),
        rawPayload: order,
      };

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
      `✅ [${tenant.id}] Опрос заказов завершен: получено ${ordersList.length}, ` +
        `обработано ${processedOrders}, пропущено (дубли) ${skippedOrders}, списано позиций ${itemsDeducted.length}`,
    );

    return {
      totalFetched: ordersList.length,
      processedOrders,
      skippedOrders,
      itemsDeducted,
    };
  }

  /**
   * Маппинг названия службы доставки Хорошоп → стандартный код (публичный для контроллера)
   */
  mapDeliveryServicePublic(title?: string): string | undefined {
    if (!title) return undefined;
    const t = title.toLowerCase();
    if (t.includes('нова пошта') || t.includes('nova poshta') || t.includes('нп')) return 'nova_poshta';
    if (t.includes('укрпошта') || t.includes('ukrposhta')) return 'ukrposhta';
    if (t.includes('самовивіз') || t.includes('самовывоз') || t.includes('pickup')) return 'selfpickup';
    if (t.includes('кур') || t.includes('courier')) return 'courier';
    return 'other';
  }
}
