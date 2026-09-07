import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Tenant } from '../tenant/tenant.entity';

export interface WooProduct {
  id?: number;
  sku?: string;
  name?: string;
  regular_price?: string;
  manage_stock?: boolean;
  stock_quantity?: number;
  stock_status?: 'instock' | 'outofstock' | 'onbackorder';
  categories?: Array<{ id?: number; name?: string; slug?: string }>;
  images?: Array<{ src: string; alt?: string }>;
  description?: string;
  short_description?: string;
  status?: 'publish' | 'draft' | 'private';
  meta_data?: Array<{ key: string; value: string }>;
}

export interface WooBatchUpdateResult {
  create?: WooProduct[];
  update?: WooProduct[];
  delete?: number[];
}

export interface WooOrder {
  id: number;
  status: string;
  line_items: Array<{
    product_id: number;
    sku: string;
    name: string;
    quantity: number;
    price: string;
  }>;
  billing: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
}

@Injectable()
export class WoocommerceApiClient {
  private readonly logger = new Logger(WoocommerceApiClient.name);

  private createClient(tenant: Tenant): AxiosInstance {
    if (!tenant.woocommerceUrl || !tenant.woocommerceConsumerKey || !tenant.woocommerceConsumerSecret) {
      throw new NotFoundException(
        `Тенант "${tenant.id}" не має налаштувань WooCommerce. Вкажіть woocommerceUrl, woocommerceConsumerKey та woocommerceConsumerSecret.`,
      );
    }

    const isHttps = tenant.woocommerceUrl.startsWith('https');

    // WooCommerce відхиляє Basic Auth по HTTP (небезпечно).
    // Для HTTP використовуємо query-string авторизацію (consumer_key + consumer_secret у params).
    // Для HTTPS — стандартний Basic Auth.
    const client = axios.create({
      baseURL: `${tenant.woocommerceUrl}/wp-json/wc/v3`,
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' },
      ...(isHttps
        ? {
            auth: {
              username: tenant.woocommerceConsumerKey,
              password: tenant.woocommerceConsumerSecret,
            },
          }
        : {}),
    });

    // Для HTTP — автоматично додаємо consumer_key і consumer_secret до кожного запиту
    if (!isHttps) {
      client.interceptors.request.use((config) => {
        config.params = {
          consumer_key: tenant.woocommerceConsumerKey,
          consumer_secret: tenant.woocommerceConsumerSecret,
          ...config.params,
        };
        return config;
      });
    }

    return client;
  }

  /**
   * Получить карту всех существующих SKU -> WooCommerce ID
   */
  async getSkuToIdMap(tenant: Tenant): Promise<Map<string, number>> {
    const client = this.createClient(tenant);
    const skuMap = new Map<string, number>();
    let page = 1;

    while (true) {
      try {
        const response = await client.get('/products', {
          params: {
            page,
            per_page: 100,
            _fields: 'id,sku',
          },
        });
        const items = response.data as Array<{ id: number; sku: string }>;
        if (!items || !items.length) break;

        for (const item of items) {
          if (item.sku && item.sku.trim()) {
            skuMap.set(item.sku.trim(), item.id);
          }
        }

        if (items.length < 100) break;
        page++;
      } catch (err) {
        this.logger.warn(`Не удалось загрузить страницу ${page} для SKU map: ${err}`);
        break;
      }
    }

    this.logger.log(`🔍 [${tenant.id}] Найдено ${skuMap.size} товаров с SKU в WooCommerce`);
    return skuMap;
  }

  /**
   * Пакетное создание/обновление товаров
   * Автоматически разделяет на create и update на основе skuMap
   */
  async batchUpsertProducts(
    tenant: Tenant,
    products: WooProduct[],
    skuMap?: Map<string, number>,
  ): Promise<WooBatchUpdateResult> {
    const client = this.createClient(tenant);
    const toCreate: WooProduct[] = [];
    const toUpdate: WooProduct[] = [];

    for (const p of products) {
      const existingId = p.id ?? (p.sku && skuMap ? skuMap.get(p.sku) : undefined);
      if (existingId) {
        toUpdate.push({ ...p, id: existingId });
      } else {
        toCreate.push(p);
      }
    }

    try {
      this.logger.log(
        `📤 [${tenant.id}] WooCommerce batch: ${toCreate.length} на создание, ${toUpdate.length} на обновление`,
      );
      const response = await client.post('/products/batch', {
        create: toCreate,
        update: toUpdate,
      });
      const data = response.data as WooBatchUpdateResult;

      // Регистрируем созданные товары в карте
      if (skuMap && data.create) {
        for (const created of data.create) {
          if (created.sku && created.id) {
            skuMap.set(created.sku.trim(), created.id);
          }
        }
      }

      return data;
    } catch (error) {
      this.logger.error(
        `❌ WooCommerce batch upsert ошибка [${tenant.id}]:`,
        axios.isAxiosError(error) ? (error.response?.data ?? error.message) : error,
      );
      throw error;
    }
  }

  /**
   * Обновить цену и остаток одного товара по WooCommerce ID
   */
  async updateProductById(
    tenant: Tenant,
    wooProductId: number,
    data: Partial<WooProduct>,
  ): Promise<WooProduct> {
    const client = this.createClient(tenant);
    const response = await client.put(`/products/${wooProductId}`, data);
    return response.data as WooProduct;
  }

  /**
   * Найти товар по SKU (наш tcod)
   */
  async getProductBySku(tenant: Tenant, sku: string): Promise<WooProduct | null> {
    const client = this.createClient(tenant);
    try {
      const response = await client.get('/products', { params: { sku, per_page: 1 } });
      const products = response.data as WooProduct[];
      return products.length > 0 ? products[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Получить список заказов
   */
  async getOrders(tenant: Tenant, status?: string, perPage = 10): Promise<WooOrder[]> {
    const client = this.createClient(tenant);
    const params: Record<string, string | number> = { per_page: perPage };
    if (status) params.status = status;
    const response = await client.get('/orders', { params });
    return response.data as WooOrder[];
  }

  /**
   * Проверить подключение к WooCommerce
   */
  async testConnection(tenant: Tenant): Promise<{ success: boolean; version?: string; message: string }> {
    try {
      const client = this.createClient(tenant);
      const response = await client.get('/system_status');
      const version = (response.data as any)?.environment?.version ?? 'unknown';
      return {
        success: true,
        version,
        message: `WooCommerce v${version} на ${tenant.woocommerceUrl}`,
      };
    } catch (error) {
      return {
        success: false,
        message: axios.isAxiosError(error)
          ? `${error.response?.status}: ${JSON.stringify(error.response?.data) || error.message}`
          : String(error),
      };
    }
  }
}
