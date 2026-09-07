import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Tenant } from '../tenant/tenant.entity';
import { RozetkaAuthService } from './rozetka-auth.service';

export interface RozetkaMassUpdateItem {
  item_id: number; // Внутренний ID товара продавца (tcod / id в XML-фиде)
  item_rz_id?: number; // ID товара в каталоге Rozetka (опционально)
  price?: number; // Цена товара (грн)
  price_old?: number; // Старая цена (зачёркнутая)
  stock_quantity?: number; // Количество в наличии
}

export interface RozetkaMassUpdatePayload {
  isIgnoreCheck?: boolean; // false = выполнять валидацию цены/наличия (по умолчанию)
  items: RozetkaMassUpdateItem[];
}

export interface RozetkaMassUpdateResult {
  success: boolean;
  updated: number;
  errorsCount: number;
  details?: unknown;
}

export interface RozetkaGoodsCounts {
  all_items?: number;
  active_items?: number;
  inactive_items?: number;
  new_items?: number;
  on_moderation_items?: number;
  items_for_update?: number;
  [key: string]: unknown;
}

export interface RozetkaOrderPurchase {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  price: number;
  cost: number;
  item?: {
    id: number;
    article?: string;
    price_offer_id?: string;
    name?: string;
  };
}

export interface RozetkaOrder {
  id: number;
  status: number;
  status_group: number;
  amount: string;
  cost: string;
  created: string;
  purchases?: RozetkaOrderPurchase[];
}

const ROZETKA_API_BASE = 'https://api-seller.rozetka.com.ua';

/**
 * HTTP-клиент Rozetka Seller API v2
 * Соответствует официальной документации: https://api-seller.rozetka.com.ua/apidoc/
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
   * Проверить подключение к Seller API (GET /goods/counts)
   * Официальный endpoint для получения счётчиков товаров продавца
   */
  async ping(tenant: Tenant): Promise<{
    success: boolean;
    message: string;
    counts?: RozetkaGoodsCounts;
  }> {
    try {
      const client = await this.createClient(tenant);
      const response = await client.get('/goods/counts');
      const counts: RozetkaGoodsCounts = response.data?.content ?? response.data;
      return {
        success: true,
        message: `Rozetka Seller API доступен. Всего товаров: ${counts?.all_items ?? 'н/д'}, активных: ${counts?.active_items ?? 'н/д'}`,
        counts,
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
   * Массовое обновление цен и остатков (PUT /items/mass-update)
   * Официальный endpoint Rozetka Seller API v2 для пакетного обновления до 500 товаров.
   * Обновляет одновременно и цену (price), и наличие (stock_quantity).
   */
  async massUpdateItems(
    tenant: Tenant,
    payload: RozetkaMassUpdatePayload,
  ): Promise<RozetkaMassUpdateResult> {
    if (!payload.items.length) {
      return { success: true, updated: 0, errorsCount: 0 };
    }

    try {
      const client = await this.createClient(tenant);
      this.logger.log(
        `📦 [${tenant.id}] Rozetka mass-update: ${payload.items.length} товаров`,
      );

      const response = await client.put('/items/mass-update', {
        isIgnoreCheck: payload.isIgnoreCheck ?? false,
        items: payload.items,
      });

      const data = response.data;
      const isSuccess = data?.success === true;
      const errors = data?.errors;
      const errorsCount = errors && typeof errors === 'object' ? Object.keys(errors).length : 0;
      const updated = isSuccess ? payload.items.length : Math.max(0, payload.items.length - errorsCount);

      return {
        success: isSuccess || updated > 0,
        updated,
        errorsCount,
        details: errors ?? data?.content,
      };
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data ?? err.message)
        : String(err);
      this.logger.error(`❌ [${tenant.id}] Rozetka mass-update error:`, msg);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        this.authService.invalidateToken(tenant.id);
      }
      throw err;
    }
  }

  /**
   * Поиск заказов продавца (GET /orders/search)
   * @param status ID статуса (1 = Новые заказы)
   */
  async searchOrders(
    tenant: Tenant,
    params: { status?: number; page?: number } = { status: 1, page: 1 },
  ): Promise<RozetkaOrder[]> {
    try {
      const client = await this.createClient(tenant);
      const response = await client.get('/orders/search', { params });
      const orders = response.data?.content?.orders ?? [];
      return Array.isArray(orders) ? orders : [];
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data ?? err.message)
        : String(err);
      this.logger.error(`❌ [${tenant.id}] Rozetka searchOrders error:`, msg);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        this.authService.invalidateToken(tenant.id);
      }
      throw err;
    }
  }

  /**
   * Получить детальную информацию по заказу включая состав покупок (GET /orders/{id}?expand=purchases,item_details)
   */
  async getOrderDetails(tenant: Tenant, orderId: number): Promise<RozetkaOrder | null> {
    try {
      const client = await this.createClient(tenant);
      const response = await client.get(`/orders/${orderId}`, {
        params: { expand: 'purchases,item_details' },
      });
      return response.data?.content ?? null;
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data ?? err.message)
        : String(err);
      this.logger.error(`❌ [${tenant.id}] Rozetka getOrderDetails error (id=${orderId}):`, msg);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        this.authService.invalidateToken(tenant.id);
      }
      return null;
    }
  }
}
