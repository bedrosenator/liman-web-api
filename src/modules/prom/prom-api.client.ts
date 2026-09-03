import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface PromProductPriceStockUpdate {
  id?: number;
  external_id: string; // our tcod
  price?: number;
  presence?: 'available' | 'not_available' | 'order' | 'service';
  quantity_in_stock?: number;
}

export interface PromProductEditItem {
  id?: number;
  external_id: string; // our tcod
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
   * Пакетное обновление цен и наличия товаров в Prom.ua
   * https://my.prom.ua/api/v1/products/edit_by_external_id
   */
  async editPricesAndStock(
    token: string,
    items: PromProductPriceStockUpdate[],
  ): Promise<{ success: boolean; processed: number; errors?: unknown[] }> {
    if (!token) {
      throw new Error('Prom API Token не задан для тенанта');
    }

    const client = this.createClient(token);
    try {
      this.logger.log(`📤 Отправка в Prom.ua пакета цен/остатков на ${items.length} товаров...`);
      const response = await client.post('/products/edit_by_external_id', items);
      return {
        success: true,
        processed: items.length,
        errors: response.data?.errors,
      };
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при вызове Prom.ua edit_by_external_id:',
        axios.isAxiosError(error) ? error.response?.data ?? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Пакетное редактирование товаров (каталог)
   * https://my.prom.ua/api/v1/products/edit
   */
  async editProducts(
    token: string,
    products: PromProductEditItem[],
  ): Promise<{ success: boolean; processed: number }> {
    const client = this.createClient(token);
    try {
      this.logger.log(`📤 Пакетный экспорт в Prom.ua ${products.length} товаров...`);
      const response = await client.post('/products/edit_by_external_id', products);
      return {
        success: true,
        processed: products.length,
      };
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при вызове Prom.ua editProducts:',
        axios.isAxiosError(error) ? error.response?.data ?? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Получить список заказов из Prom.ua
   */
  async getOrders(token: string, status?: string): Promise<any[]> {
    const client = this.createClient(token);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      const response = await client.get('/orders/list', { params });
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
