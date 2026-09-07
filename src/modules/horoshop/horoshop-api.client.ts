import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Tenant } from '../tenant/tenant.entity';
import { HoroshopAuthService } from './horoshop-auth.service';

export interface HoroshopStockPriceItem {
  article: string; // tcod in Limansoft
  price: number;
  stock: number;
  presence?: boolean;
}

@Injectable()
export class HoroshopApiClient {
  private readonly logger = new Logger(HoroshopApiClient.name);
  private readonly http: AxiosInstance;

  constructor(private readonly authService: HoroshopAuthService) {
    this.http = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Базовый URL API конкретного тенанта
   */
  private getBaseUrl(tenant: Tenant): string {
    const raw = (tenant.horoshopDomain || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${raw}/api`;
  }

  /**
   * Выполнить авторизованный запрос к Horoshop API
   */
  private async request<T = any>(
    tenant: Tenant,
    endpoint: string,
    data: any = {},
    retryOn401 = true,
  ): Promise<T> {
    const token = await this.authService.getToken(tenant);
    const url = `${this.getBaseUrl(tenant)}/${endpoint.replace(/^\/+/, '')}`;

    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Auth-Token': token,
      },
    };

    try {
      const response = await this.http.post<T>(url, data, config);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401 && retryOn401) {
        this.logger.warn(`[${tenant.id}] 401 Unauthorized от Horoshop API. Обновляем токен и повторяем...`);
        this.authService.clearToken(tenant.id);
        const newToken = await this.authService.getToken(tenant, true);
        config.headers!['Authorization'] = `Bearer ${newToken}`;
        config.headers!['X-Auth-Token'] = newToken;
        const retryResponse = await this.http.post<T>(url, data, config);
        return retryResponse.data;
      }

      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const responseData = error.response?.data;
      this.logger.error(
        `❌ [${tenant.id}] Ошибка Horoshop API [${status}] на ${endpoint}:`,
        responseData || error.message,
      );

      throw new HttpException(
        responseData?.message || `Ошибка Horoshop API (${status}): ${error.message}`,
        status,
      );
    }
  }

  /**
   * Проверка связи с Хорошоп (получение токена)
   */
  async ping(tenant: Tenant): Promise<{
    connected: boolean;
    domain: string;
    authStatus: string;
    timestamp: string;
  }> {
    const domain = tenant.horoshopDomain || '';
    if (!domain) {
      return {
        connected: false,
        domain: 'Не настроен',
        authStatus: 'Отсутствует horoshopDomain',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const token = await this.authService.getToken(tenant, true);
      return {
        connected: true,
        domain,
        authStatus: `Успешно авторизован (токен: ${token.substring(0, 10)}...)`,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        connected: false,
        domain,
        authStatus: `Ошибка авторизации: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Пакетное обновление цен и остатков в Хорошоп
   * Отправляет массив позиций в /api/catalog/import/ или /api/products/update/
   */
  async updateStocksAndPrices(
    tenant: Tenant,
    items: HoroshopStockPriceItem[],
  ): Promise<{
    success: boolean;
    total: number;
    response: any;
  }> {
    const payload = {
      products: items.map((item) => ({
        article: String(item.article),
        price: item.price,
        remains: item.stock,
        presence: item.stock > 0,
      })),
    };

    this.logger.log(`📤 [${tenant.id}] Отправка ${items.length} позиций в Horoshop API (/catalog/import/)`);
    const response = await this.request(tenant, 'catalog/import/', payload);

    return {
      success: true,
      total: items.length,
      response,
    };
  }

  /**
   * Получить список заказов из Хорошоп
   */
  async getOrders(
    tenant: Tenant,
    filter: { date_from?: string; status?: string; limit?: number } = {},
  ): Promise<any> {
    return this.request(tenant, 'orders/get/', filter);
  }
}
