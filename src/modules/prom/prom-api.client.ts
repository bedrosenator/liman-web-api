import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface PromGroup {
  id: number;
  name: string;
  description?: string;
  image?: string;
  parent_group_id?: number | null;
}

export interface PromProductPriceStockUpdate {
  id?: number | string;
  external_id?: string; // our tcod
  price?: number;
  presence?: 'available' | 'not_available' | 'order' | 'service';
  quantity_in_stock?: number;
}

export interface PromProductEditItem {
  id?: number;
  external_id?: string; // our tcod
  name?: string;
  price?: number;
  presence?: 'available' | 'not_available' | 'order';
  quantity_in_stock?: number;
  category_id?: number;
  description?: string;
  images?: string[];
  sku?: string;
}

export interface PromProductItem {
  id: number;
  external_id?: string;
  name: string;
  sku?: string;
  price?: number;
  minimum_order_quantity?: number;
  currency?: string;
  group?: {
    id: number;
    name: string;
  };
  category?: {
    id: number;
    caption: string;
  };
  main_image?: string;
  images?: Array<{
    id?: number;
    url: string;
    thumbnail_url?: string;
  }>;
  presence?: 'available' | 'not_available' | 'order' | 'service';
  quantity_in_stock?: number;
  description?: string;
  keywords?: string;
  status?: 'on_display' | 'draft' | 'deleted' | 'not_on_display';
}

export interface PromImportUrlOptions {
  url: string;
  force_update?: boolean;
  only_available?: boolean;
  only_update?: boolean;
  mark_missing_product_as?:
    | 'none'
    | 'not_available'
    | 'not_on_display'
    | 'deleted';
  updated_fields?: string[];
}

export interface PromImportStatusResponse {
  id: string | number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  total_items?: number;
  processed_items?: number;
  errors?: unknown;
}

export interface PromOrderProduct {
  id: number;
  external_id?: string;
  name?: string;
  sku?: string;
  quantity: number;
  price: string | number;
  total_price?: string | number;
  image?: string;
  url?: string;
}

export interface PromOrder {
  id: number;
  date_created: string;
  client_first_name?: string;
  client_second_name?: string;
  client_last_name?: string;
  client_id?: number;
  client_notes?: string;
  phone?: string;
  email?: string;
  price?: string | number;
  full_price?: string | number;
  delivery_address?: string;
  delivery_option?: {
    id?: number;
    name?: string;
  };
  delivery_provider_data?: any;
  delivery_cost?: number;
  payment_option?: {
    id?: number;
    name?: string;
  };
  status: string;
  status_name?: string;
  source?: string;
  products: PromOrderProduct[];
}

@Injectable()
export class PromApiClient {
  private readonly logger = new Logger(PromApiClient.name);
  private readonly baseUrl = 'https://my.prom.ua/api/v1';

  private createClient(token: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  /**
   * Проверка доступности и валидности API-токена Prom.ua
   */
  async ping(token: string): Promise<{
    success: boolean;
    message: string;
    productsCount?: number;
    ordersCount?: number;
    shopTitle?: string;
  }> {
    if (!token) {
      throw new Error('Prom API Token не задан');
    }
    const client = this.createClient(token);
    try {
      const [productsRes, ordersRes] = await Promise.all([
        client.get<{ products?: unknown[] }>('/products/list', {
          params: { limit: 10 },
        }),
        client.get<{ orders?: unknown[] }>('/orders/list', {
          params: { limit: 10 },
        }),
      ]);
      const products = productsRes.data?.products ?? [];
      const orders = ordersRes.data?.orders ?? [];

      let shopTitle: string | undefined;
      try {
        const companyRes = await client.get<{ name?: string; title?: string }>(
          '/company/info',
          { timeout: 5000 },
        );
        shopTitle = companyRes.data?.name || companyRes.data?.title;
      } catch {
        // /company/info может быть недоступен на некоторых тарифах/версиях API
      }

      return {
        success: true,
        message: 'Подключение к Prom.ua успешно установлено',
        productsCount: products.length,
        ordersCount: orders.length,
        shopTitle,
      };
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при проверке подключения к Prom.ua:',
        axios.isAxiosError(error)
          ? (error.response?.data ?? error.message)
          : error,
      );
      throw error;
    }
  }

  /**
   * Получить список групп (категорий) из Prom.ua
   */
  async getGroups(
    token: string,
    params?: { last_modified_from?: string; last_modified_to?: string },
  ): Promise<PromGroup[]> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      const response = await client.get<{ groups?: PromGroup[] }>(
        '/groups/list',
        { params },
      );
      return response.data?.groups ?? [];
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при получении групп товаров из Prom.ua:',
        axios.isAxiosError(error) ? error.response?.data : error,
      );
      throw error;
    }
  }

  /**
   * Получить список товаров из Prom.ua
   */
  async getProducts(
    token: string,
    params?: { limit?: number; last_id?: number; group_id?: number },
  ): Promise<PromProductItem[]> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      const response = await client.get<{ products?: PromProductItem[] }>(
        '/products/list',
        { params },
      );
      return response.data?.products ?? [];
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при получении товаров из Prom.ua:',
        axios.isAxiosError(error) ? error.response?.data : error,
      );
      throw error;
    }
  }

  /**
   * Получить один товар по ID Prom
   */
  async getProductById(
    token: string,
    id: number | string,
  ): Promise<PromProductItem | null> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      const response = await client.get<{ product?: PromProductItem }>(
        `/products/${id}`,
      );
      return response.data?.product ?? null;
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при получении товара #${id} из Prom.ua:`,
        axios.isAxiosError(error) ? error.response?.data : error,
      );
      throw error;
    }
  }

  /**
   * Получить товар по external_id (наш tcod)
   */
  async getProductByExternalId(
    token: string,
    externalId: string | number,
  ): Promise<PromProductItem | null> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      const response = await client.get<{ product?: PromProductItem }>(
        `/products/by_external_id/${externalId}`,
      );
      return response.data?.product ?? null;
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при получении товара по external_id=${externalId} из Prom.ua:`,
        axios.isAxiosError(error) ? error.response?.data : error,
      );
      throw error;
    }
  }

  /**
   * Пакетное обновление цен и наличия товаров в Prom.ua по внешнему коду (tcod)
   * https://my.prom.ua/api/v1/products/edit_by_external_id
   */
  async editPricesAndStock(
    token: string,
    items: PromProductPriceStockUpdate[],
  ): Promise<{ success: boolean; processed: number; errors?: unknown }> {
    if (!token) {
      throw new Error('Prom API Token не задан для тенанта');
    }

    const client = this.createClient(token);
    try {
      this.logger.log(
        `📤 Отправка в Prom.ua пакета цен/остатков на ${items.length} товаров...`,
      );
      const payload = items.map((item) => ({
        id: item.id ?? item.external_id,
        ...(item.price !== undefined ? { price: item.price } : {}),
        ...(item.presence ? { presence: item.presence } : {}),
        ...(item.quantity_in_stock !== undefined
          ? { quantity_in_stock: item.quantity_in_stock }
          : {}),
      }));

      const response = await client.post<{
        processed_ids?: (string | number)[];
        errors?: unknown;
      }>('/products/edit_by_external_id', payload);
      return {
        success: true,
        processed: response.data?.processed_ids?.length ?? items.length,
        errors: response.data?.errors,
      };
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при вызове Prom.ua edit_by_external_id:',
        axios.isAxiosError(error)
          ? (error.response?.data ?? error.message)
          : error,
      );
      throw error;
    }
  }

  /**
   * Прямое редактирование товаров по внутреннему Prom ID
   * https://my.prom.ua/api/v1/products/edit
   */
  async editProductsById(
    token: string,
    products: Array<{
      id: number;
      price?: number;
      presence?: 'available' | 'not_available' | 'order';
      quantity_in_stock?: number;
      name?: string;
    }>,
  ): Promise<{ success: boolean; processedIds: number[]; errors?: unknown }> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      this.logger.log(
        `📤 Прямое редактирование в Prom.ua ${products.length} товаров по ID...`,
      );
      const response = await client.post<{
        processed_ids?: number[];
        errors?: unknown;
      }>('/products/edit', products);
      return {
        success: true,
        processedIds: response.data?.processed_ids ?? [],
        errors: response.data?.errors,
      };
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при вызове Prom.ua products/edit:',
        axios.isAxiosError(error)
          ? (error.response?.data ?? error.message)
          : error,
      );
      throw error;
    }
  }

  /**
   * Пакетное редактирование товаров (каталог)
   */
  async editProducts(
    token: string,
    products: PromProductEditItem[],
  ): Promise<{ success: boolean; processed: number; errors?: unknown }> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      this.logger.log(
        `📤 Пакетный экспорт в Prom.ua ${products.length} товаров...`,
      );
      const response = await client.post<{
        processed_ids?: number[];
        errors?: unknown;
      }>('/products/edit', products);
      return {
        success: true,
        processed: response.data?.processed_ids?.length ?? products.length,
        errors: response.data?.errors,
      };
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при вызове Prom.ua editProducts:',
        axios.isAxiosError(error)
          ? (error.response?.data ?? error.message)
          : error,
      );
      throw error;
    }
  }

  /**
   * Запуск импорта каталога товаров через URL (YML/XML фид)
   * https://my.prom.ua/api/v1/products/import_url
   */
  async importUrl(
    token: string,
    options: PromImportUrlOptions,
  ): Promise<{ success: boolean; id?: string | number; message?: string }> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      this.logger.log(
        `📤 Запуск импорта каталога Prom.ua по фиду: ${options.url}`,
      );
      const response = await client.post<{ id?: string | number; message?: string }>(
        '/products/import_url',
        {
          url: options.url,
          force_update: options.force_update ?? false,
          only_available: options.only_available ?? false,
          only_update: options.only_update ?? false,
          mark_missing_product_as: options.mark_missing_product_as ?? 'none',
          updated_fields: options.updated_fields ?? [
            'price',
            'presence',
            'quantity_in_stock',
          ],
        },
      );
      return {
        success: true,
        id: response.data?.id,
        message: response.data?.message,
      };
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при вызове Prom.ua products/import_url:',
        axios.isAxiosError(error)
          ? (error.response?.data ?? error.message)
          : error,
      );
      throw error;
    }
  }

  /**
   * Получить статус выполнения импорта фида в Prom.ua
   * https://my.prom.ua/api/v1/products/import/status/{id}
   */
  async getImportStatus(
    token: string,
    importId: string | number,
  ): Promise<PromImportStatusResponse> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      const response = await client.get<PromImportStatusResponse>(
        `/products/import/status/${importId}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при получении статуса импорта #${importId} из Prom.ua:`,
        axios.isAxiosError(error)
          ? (error.response?.data ?? error.message)
          : error,
      );
      throw error;
    }
  }

  /**
   * Получить список заказов из Prom.ua
   */
  async getOrders(
    token: string,
    params?: {
      status?: string;
      date_from?: string;
      limit?: number;
      last_id?: number;
    } | string,
  ): Promise<PromOrder[]> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      const queryParams: Record<string, any> =
        typeof params === 'string' ? { status: params } : (params ?? {});
      const response = await client.get<{ orders?: PromOrder[] }>(
        '/orders/list',
        { params: queryParams },
      );
      return response.data?.orders ?? [];
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при получении заказов из Prom.ua:',
        axios.isAxiosError(error) ? error.response?.data : error,
      );
      throw error;
    }
  }

  /**
   * Получить один заказ по ID из Prom.ua
   */
  async getOrder(
    token: string,
    orderId: number | string,
  ): Promise<PromOrder | null> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      const response = await client.get<{ order?: PromOrder }>(
        `/orders/${orderId}`,
      );
      return response.data?.order ?? null;
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при получении заказа #${orderId} из Prom.ua:`,
        axios.isAxiosError(error) ? error.response?.data : error,
      );
      throw error;
    }
  }

  /**
   * Установить статус заказа в Prom.ua
   */
  async setOrderStatus(
    token: string,
    orderId: number | string,
    status: string,
    cancellationReason?: string,
  ): Promise<{ success: boolean }> {
    if (!token) throw new Error('Prom API Token не задан');
    const client = this.createClient(token);
    try {
      await client.post('/orders/set_status', {
        status,
        ids: [Number(orderId)],
        ...(cancellationReason
          ? { cancellation_reason: cancellationReason }
          : {}),
      });
      return { success: true };
    } catch (error) {
      this.logger.error(
        `❌ Ошибка при установке статуса заказа #${orderId} в Prom.ua:`,
        axios.isAxiosError(error) ? error.response?.data : error,
      );
      throw error;
    }
  }
}
