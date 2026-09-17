import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Tenant } from '../tenant/tenant.entity';
import { HoroshopAuthService } from './horoshop-auth.service';

export interface HoroshopStockPriceItem {
  article: string; // tcod in Limansoft
  price: number;
  stock: number;
  presence?: boolean;
  title?: string | { ua: string; ru?: string };
  parent?: string | number;
  barcode?: string;
}

export interface HoroshopImportLogItem {
  code: number;
  article: string;
  message?: string;
}

export interface HoroshopUpdateResponse {
  success: boolean;
  total: number;
  updated: number;
  log: HoroshopImportLogItem[];
  response: any;
}

export interface HoroshopCatalogProductItem {
  article: string;
  title: string;
  price?: number;
  quantity?: number;
  presence?: number;
  barcode?: string;
  parent?: string;
  description?: string;
  images?: string[];
}

export interface HoroshopCatalogCategoryItem {
  id?: string;
  name: string;
  parent?: string;
}

export interface HoroshopDirectExportPayload {
  products: HoroshopCatalogProductItem[];
  categories?: HoroshopCatalogCategoryItem[];
}

export interface HoroshopDirectExportResponse {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  log: HoroshopImportLogItem[];
  response: any;
}

export const HOROSHOP_CONSTANTS = {
  DEFAULT_BATCH_SIZE: 100,
  API_CODE_SUCCESS: 0,
  PRESENCE_IN_STOCK: 1,
  PRESENCE_OUT_OF_STOCK: 2,
  FETCH_TITLE_TIMEOUT_MS: 4000,
  MOCK_NEW_PRODUCTS_RATIO: 0.4,
} as const;

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
    const raw = (tenant.horoshopDomain || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
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

    const body =
      typeof data === 'object' && data !== null ? { token, ...data } : data;

    try {
      const response = await this.http.post<T>(url, body, config);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401 && retryOn401) {
        this.logger.warn(
          `[${tenant.id}] 401 Unauthorized от Horoshop API. Обновляем токен и повторяем...`,
        );
        this.authService.clearToken(tenant.id);
        const newToken = await this.authService.getToken(tenant, true);
        config.headers!['Authorization'] = `Bearer ${newToken}`;
        config.headers!['X-Auth-Token'] = newToken;
        const retryBody =
          typeof data === 'object' && data !== null
            ? { token: newToken, ...data }
            : data;
        const retryResponse = await this.http.post<T>(url, retryBody, config);
        return retryResponse.data;
      }

      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const responseData = error.response?.data;
      this.logger.error(
        `❌ [${tenant.id}] Ошибка Horoshop API [${status}] на ${endpoint}:`,
        responseData || error.message,
      );

      throw new HttpException(
        responseData?.message ||
          `Ошибка Horoshop API (${status}): ${error.message}`,
        status,
      );
    }
  }

  /**
   * Проверка, включен ли тестовый/mock режим
   */
  private isMockMode(tenant: Tenant): boolean {
    const d = (tenant.horoshopDomain || '').toLowerCase();
    return d === 'mock' || d === 'test' || d.includes('mock');
  }

  /**
   * Получить метаданные или название магазина Хорошоп
   */
  async getShopInfo(tenant: Tenant): Promise<{ shopTitle?: string; domain?: string }> {
    const rawDomain = (tenant.horoshopDomain || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');

    if (this.isMockMode(tenant)) {
      return {
        shopTitle: tenant.horoshopShopTitle || 'Columb Shop (Хорошоп Розница)',
        domain: rawDomain || 'columb.horoshop.ua',
      };
    }

    if (!rawDomain) {
      return { shopTitle: tenant.horoshopShopTitle || undefined, domain: undefined };
    }

    try {
      const url = `https://${rawDomain}/`;
      const res = await axios.get(url, {
        timeout: HOROSHOP_CONSTANTS.FETCH_TITLE_TIMEOUT_MS,
      });
      if (typeof res.data === 'string') {
        const titleMatch = res.data.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          const cleanTitle = titleMatch[1]
            .split(/[-|–—]/)[0]
            .replace(/\s+/g, ' ')
            .trim();
          if (cleanTitle) {
            return { shopTitle: cleanTitle, domain: rawDomain };
          }
        }
      }
    } catch (e: any) {
      this.logger.debug(
        `[${tenant.id}] Не удалось извлечь заголовок магазина из ${rawDomain}: ${e.message}`,
      );
    }

    return {
      shopTitle: tenant.horoshopShopTitle || rawDomain,
      domain: rawDomain,
    };
  }

  /**
   * Проверка связи с Хорошоп (получение токена)
   */
  async ping(tenant: Tenant): Promise<{
    connected: boolean;
    domain: string;
    authStatus: string;
    shopTitle?: string;
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

    if (this.isMockMode(tenant)) {
      const shopInfo = await this.getShopInfo(tenant);
      return {
        connected: true,
        domain: `${domain} (Тестовый Sandbox MOCK)`,
        authStatus: 'Тестовый режим (MOCK): авторизация эмулирована успешно',
        shopTitle: shopInfo.shopTitle,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const token = await this.authService.getToken(tenant, true);
      const shopInfo = await this.getShopInfo(tenant);
      return {
        connected: true,
        domain,
        authStatus: `Успешно авторизован (токен: ${token.substring(0, 10)}...)`,
        shopTitle: shopInfo.shopTitle,
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
  ): Promise<HoroshopUpdateResponse> {
    if (this.isMockMode(tenant)) {
      this.logger.log(
        `🧪 [${tenant.id}] MOCK: симуляция отправки ${items.length} позиций в Horoshop API (/catalog/import/)`,
      );
      const mockLog: HoroshopImportLogItem[] = items.map((item) => ({
        code: HOROSHOP_CONSTANTS.API_CODE_SUCCESS,
        article: String(item.article),
        message: 'MOCK: Товар успешно обновлен',
      }));
      return {
        success: true,
        total: items.length,
        updated: items.length,
        log: mockLog,
        response: {
          status: 'OK',
          response: {
            updated: items.length,
            log: mockLog,
            message: 'MOCK: товары, цены и остатки успешно обновлены',
          },
        },
      };
    }

    const payload = {
      products: items.map((item) => {
        const productData: any = {
          article: String(item.article),
          price: item.price,
          quantity: Math.max(0, item.stock),
          presence:
            item.stock > 0
              ? HOROSHOP_CONSTANTS.PRESENCE_IN_STOCK
              : HOROSHOP_CONSTANTS.PRESENCE_OUT_OF_STOCK,
        };
        if (item.title !== undefined) productData.title = item.title;
        if (item.parent !== undefined) productData.parent = item.parent;
        if (item.barcode !== undefined) productData.barcode = item.barcode;
        return productData;
      }),
    };

    this.logger.log(
      `📤 [${tenant.id}] Отправка ${items.length} позиций в Horoshop API (/catalog/import/)`,
    );
    const response = await this.request(tenant, 'catalog/import/', payload);
    const respData = response?.response || response || {};
    const updatedCount =
      typeof respData.updated === 'number' ? respData.updated : items.length;
    const log: HoroshopImportLogItem[] = Array.isArray(respData.log)
      ? respData.log.map((entry: any) => ({
          code: Number(entry.code ?? HOROSHOP_CONSTANTS.API_CODE_SUCCESS),
          article: String(entry.article || ''),
          message:
            entry.message ||
            (entry.code === HOROSHOP_CONSTANTS.API_CODE_SUCCESS ? 'OK' : 'Error'),
        }))
      : items.map((item) => ({
          code: HOROSHOP_CONSTANTS.API_CODE_SUCCESS,
          article: String(item.article),
          message: 'OK',
        }));

    return {
      success: true,
      total: items.length,
      updated: updatedCount,
      log,
      response,
    };
  }

  /**
   * Прямой экспорт полного каталога (товары, категории, описания, фото) в Хорошоп
   * Отправляет пакет в /api/catalog/import/
   */
  async importCatalog(
    tenant: Tenant,
    payload: HoroshopDirectExportPayload,
  ): Promise<HoroshopDirectExportResponse> {
    const products = payload.products || [];
    if (this.isMockMode(tenant)) {
      this.logger.log(
        `🧪 [${tenant.id}] MOCK: симуляция прямого экспорта каталога (${products.length} товаров) в Horoshop API (/catalog/import/)`,
      );
      const mockLog: HoroshopImportLogItem[] = products.map((item) => ({
        code: HOROSHOP_CONSTANTS.API_CODE_SUCCESS,
        article: String(item.article),
        message: 'MOCK: Товар успешно выгружен в каталог Хорошоп',
      }));
      const createdCount = Math.floor(
        products.length * HOROSHOP_CONSTANTS.MOCK_NEW_PRODUCTS_RATIO,
      );
      const updatedCount = products.length - createdCount;
      return {
        success: true,
        total: products.length,
        created: createdCount,
        updated: updatedCount,
        log: mockLog,
        response: {
          status: 'OK',
          response: {
            created: createdCount,
            updated: updatedCount,
            log: mockLog,
          },
        },
      };
    }

    this.logger.log(
      `📤 [${tenant.id}] Прямой экспорт ${products.length} позиций в Horoshop API (/catalog/import/)`,
    );
    const response = await this.request(tenant, 'catalog/import/', payload);
    const respData = response?.response || response || {};
    const createdCount = typeof respData.created === 'number' ? respData.created : 0;
    const updatedCount =
      typeof respData.updated === 'number' ? respData.updated : products.length - createdCount;

    const log: HoroshopImportLogItem[] = Array.isArray(respData.log)
      ? respData.log.map((entry: any) => ({
          code: Number(entry.code ?? HOROSHOP_CONSTANTS.API_CODE_SUCCESS),
          article: String(entry.article || ''),
          message:
            entry.message ||
            (entry.code === HOROSHOP_CONSTANTS.API_CODE_SUCCESS ? 'OK' : 'Error'),
        }))
      : products.map((item) => ({
          code: HOROSHOP_CONSTANTS.API_CODE_SUCCESS,
          article: String(item.article),
          message: 'OK',
        }));

    return {
      success: true,
      total: products.length,
      created: createdCount,
      updated: updatedCount,
      log,
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
    if (this.isMockMode(tenant)) {
      this.logger.log(
        `🧪 [${tenant.id}] MOCK: симуляция получения заказов из Хорошоп`,
      );
      return {
        status: 'OK',
        response: {
          orders: [
            {
              id: 10421,
              status: 'new',
              created: new Date().toISOString(),
              total: 332.86,
              currency: 'UAH',
              delivery: { title: 'Нова Пошта' },
              products: [
                {
                  article: '16',
                  quantity: 1,
                  price: 142.86,
                  title: 'Bond Street Blue Selection',
                },
                {
                  article: '251',
                  quantity: 2,
                  price: 47.0,
                  title: 'Burn 0.25 Original',
                },
              ],
            },
            {
              id: 10422,
              status: 'processing',
              created: new Date().toISOString(),
              total: 142.86,
              currency: 'UAH',
              delivery: { title: 'Самовивіз' },
              products: [
                {
                  article: '16',
                  quantity: 1,
                  price: 142.86,
                  title: 'Bond Street Blue Selection',
                },
              ],
            },
          ],
        },
      };
    }

    return this.request(tenant, 'orders/get/', filter);
  }

  /**
   * Выгрузить каталог товаров из Хорошоп
   * Используется для обратной синхронизации (Хорошоп → Limansoft MariaDB, TASK-22)
   */
  async exportCatalog(
    tenant: Tenant,
    options: { page?: number; limit?: number } = {},
  ): Promise<{
    status: string;
    response: {
      products: Array<{
        article: string;
        title: string;
        price: number;
        stock?: number;
        presence?: number;
        barcode?: string;
        category?: string;
        description?: string;
        images?: string[];
      }>;
      total?: number;
    };
  }> {
    if (this.isMockMode(tenant)) {
      this.logger.log(
        `🧪 [${tenant.id}] MOCK: симуляция экспорта каталога из Хорошоп (/catalog/export/)`,
      );
      return {
        status: 'OK',
        response: {
          total: 3,
          products: [
            {
              article: '16',
              title: 'Bond Street Blue Selection (MOCK)',
              price: 142.86,
              stock: 25,
              presence: 1,
              barcode: '482000000016',
              category: 'Сигареты',
              description: 'Сигареты Bond Street Blue Selection оригинальные',
              images: ['https://placehold.co/400x400.png?text=Bond+Street'],
            },
            {
              article: '251',
              title: 'Burn 0.25 Original (MOCK)',
              price: 47.0,
              stock: 40,
              presence: 1,
              barcode: '482000000251',
              category: 'Напитки',
              description: 'Энергетический напиток Burn 0.25',
              images: ['https://placehold.co/400x400.png?text=Burn'],
            },
            {
              article: '99999',
              title: 'Новый товар из Хорошоп MOCK 2026',
              price: 199.99,
              stock: 15,
              presence: 1,
              barcode: '482000099999',
              category: 'Новинки',
              description: 'Эксклюзивная позиция, созданная в админке Хорошоп',
              images: ['https://placehold.co/400x400.png?text=Horoshop+New'],
            },
          ],
        },
      };
    }

    return this.request(tenant, 'catalog/export/', {
      page: options.page || 1,
      limit: options.limit || 50,
    });
  }
}

