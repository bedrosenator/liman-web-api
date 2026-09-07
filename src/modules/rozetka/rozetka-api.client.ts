import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Tenant } from '../tenant/tenant.entity';
import { RozetkaAuthService } from './rozetka-auth.service';

export interface RozetkaStockItem {
  item_id: number | string; // Rozetka item_id или наш tcod
  stock: number;
}

export interface RozetkaStockUpdate {
  /**
   * Используем артикул (id предложения в фиде) как ключ поиска
   */
  id: number | string;
  stock: number;
}

export interface RozetkaPrice {
  id: number; // tcod
  price: number;
  old_price?: number;
}

export interface RozetkaUpdateResult {
  success: boolean;
  updated: number;
  errors?: number;
  details?: unknown;
}

const ROZETKA_API_BASE = 'https://api.seller.rozetka.com.ua';

/**
 * HTTP-клиент Rozetka Seller API v2
 */
@Injectable()
export class RozetkaApiClient {
  private readonly logger = new Logger(RozetkaApiClient.name);

  constructor(private readonly authService: RozetkaAuthService) {}

  /**
   * Создаёт axios-клиент с действующим Bearer токеном
   */
  private async createClient(tenant: Tenant): Promise<AxiosInstance> {
    const token = await this.authService.getAccessToken(tenant);
    return axios.create({
      baseURL: ROZETKA_API_BASE,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Проверить подключение к Seller API
   */
  async ping(tenant: Tenant): Promise<{ success: boolean; message: string; shops?: unknown }> {
    try {
      const client = await this.createClient(tenant);
      const response = await client.get('/sites');
      const shops = response.data?.content ?? response.data;
      return {
        success: true,
        message: `Rozetka Seller API доступен. Магазинов: ${Array.isArray(shops) ? shops.length : '?'}`,
        shops,
      };
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data ?? err.message)}`
        : String(err);

      if (axios.isAxiosError(err) && err.response?.status === 401) {
        this.authService.invalidateToken(tenant.id);
      }

      return { success: false, message };
    }
  }

  /**
   * Обновить остатки товаров по массиву { item_id, stock }
   * Endpoint: PUT /goods/stocks  (Rozetka Seller API v2)
   */
  async updateStocks(
    tenant: Tenant,
    items: RozetkaStockItem[],
  ): Promise<RozetkaUpdateResult> {
    if (!items.length) return { success: true, updated: 0 };

    try {
      const client = await this.createClient(tenant);
      this.logger.log(`📦 [${tenant.id}] Rozetka updateStocks: ${items.length} товаров`);

      const response = await client.put('/goods/stocks', { items });
      const data = response.data;

      const updated =
        data?.content?.updated_count ??
        data?.updated_count ??
        items.length;

      return { success: true, updated };
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data ?? err.message)
        : String(err);
      this.logger.error(`❌ [${tenant.id}] Rozetka updateStocks error:`, msg);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        this.authService.invalidateToken(tenant.id);
      }
      throw err;
    }
  }

  /**
   * Обновить цены товаров по массиву { item_id, price }
   * Endpoint: PUT /goods/prices  (Rozetka Seller API v2)
   */
  async updatePrices(
    tenant: Tenant,
    items: RozetkaPrice[],
  ): Promise<RozetkaUpdateResult> {
    if (!items.length) return { success: true, updated: 0 };

    try {
      const client = await this.createClient(tenant);
      this.logger.log(`💰 [${tenant.id}] Rozetka updatePrices: ${items.length} товаров`);

      const response = await client.put('/goods/prices', { items });
      const data = response.data;

      const updated =
        data?.content?.updated_count ??
        data?.updated_count ??
        items.length;

      return { success: true, updated };
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data ?? err.message)
        : String(err);
      this.logger.error(`❌ [${tenant.id}] Rozetka updatePrices error:`, msg);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        this.authService.invalidateToken(tenant.id);
      }
      throw err;
    }
  }
}
