import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

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
      return {
        success: true,
        message: 'Подключение к Prom.ua успешно установлено',
        productsCount: products.length,
        ordersCount: orders.length,
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
   * Получить список товаров из Prom.ua
   */
  async getProducts(
    token: string,
    params?: { limit?: number; last_id?: number; group_id?: number },
  ): Promise<unknown[]> {
    const client = this.createClient(token);
    try {
      const response = await client.get<{ products?: unknown[] }>(
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
   * Пакетное обновление цен и наличия товаров в Prom.ua по внешнему коду (tcod)
   * https://my.prom.ua/api/v1/products/edit_by_external_id
   * Prom ожидает: [ { id: "<external_id>", price?: number, presence?: string, quantity_in_stock?: number } ]
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
  ): Promise<{ success: boolean; processed: number }> {
    const client = this.createClient(token);
    try {
      this.logger.log(
        `📤 Пакетный экспорт в Prom.ua ${products.length} товаров...`,
      );
      await client.post('/products/edit', products);
      return {
        success: true,
        processed: products.length,
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
   * Получить список заказов из Prom.ua
   */
  async getOrders(token: string, status?: string): Promise<unknown[]> {
    const client = this.createClient(token);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      const response = await client.get<{ orders?: unknown[] }>(
        '/orders/list',
        { params },
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
}
