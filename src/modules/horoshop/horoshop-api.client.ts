import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
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
  errors?: number;
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
  gtin?: string;
  parent?: string;
  description?: string;
  images?: string[];
  brand?: string;
  currency?: string;
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
  errors?: number;
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
  THROTTLE_DELAY_MS: 250,
  MAX_TRANSIENT_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 8000,
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Выполнить авторизованный запрос к Horoshop API
   */
  private async request<T = any>(
    tenant: Tenant,
    endpoint: string,
    data: any = {},
    retryOn401 = true,
    attempt = 0,
  ): Promise<T> {
    const token = await this.authService.getToken(tenant);
    const url = `${this.getBaseUrl(tenant)}/${endpoint.replace(/^\/+/, '')}`;

    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const body =
      typeof data === 'object' && data !== null ? { token, ...data } : data;

    try {
      const response = await this.http.post<T>(url, body, config);
      const resData = response.data as any;

      const isAuthError =
        resData?.status === 'AUTHORIZATION_ERROR' ||
        resData?.status === 'AUTH_ERROR' ||
        resData?.response?.message === 'Auth required.\n' ||
        resData?.response?.message?.includes('Bearer');

      if (isAuthError) {
        if (retryOn401) {
          this.logger.warn(
            `[${tenant.id}] Ошибка авторизации (${resData?.response?.message || resData?.status}) от Horoshop API. Обновляем токен и повторяем...`,
          );
          this.authService.clearToken(tenant.id);
          return this.request<T>(tenant, endpoint, data, false, attempt);
        }
        throw new UnauthorizedException(
          resData?.response?.message || 'Ошибка авторизации Хорошоп',
        );
      }

      if (resData?.status === 'ERROR') {
        const errMsg =
          resData?.response?.message ||
          resData?.message ||
          'Ошибка Horoshop API';
        this.logger.error(`❌ [${tenant.id}] Ошибка Horoshop API: ${errMsg}`);
        throw new BadRequestException(errMsg);
      }

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401 && retryOn401) {
        this.logger.warn(
          `[${tenant.id}] 401 Unauthorized от Horoshop API. Обновляем токен и повторяем...`,
        );
        this.authService.clearToken(tenant.id);
        return this.request<T>(tenant, endpoint, data, false, attempt);
      }

      const status = error.response?.status;
      const isTransientError =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'EAI_AGAIN';

      if (
        isTransientError &&
        attempt < HOROSHOP_CONSTANTS.MAX_TRANSIENT_RETRIES
      ) {
        const nextAttempt = attempt + 1;
        const delay = Math.min(
          HOROSHOP_CONSTANTS.MAX_RETRY_DELAY_MS,
          HOROSHOP_CONSTANTS.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) +
            Math.floor(Math.random() * 300),
        );

        this.logger.warn(
          `⚠️ [${tenant.id}] Временный сбой Horoshop API [${status || error.code}] на ${endpoint}: ` +
            `"${error.response?.data?.message || error.message}". ` +
            `Повторная попытка ${nextAttempt}/${HOROSHOP_CONSTANTS.MAX_TRANSIENT_RETRIES} через ${delay}мс...`,
        );

        await this.sleep(delay);
        return this.request<T>(tenant, endpoint, data, retryOn401, nextAttempt);
      }

      if (error instanceof HttpException) {
        throw error;
      }

      const finalStatus =
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const responseData = error.response?.data;
      this.logger.error(
        `❌ [${tenant.id}] Ошибка Horoshop API [${finalStatus}] на ${endpoint}:`,
        responseData || error.message,
      );

      throw new HttpException(
        responseData?.message ||
          error.message ||
          `Ошибка Horoshop API (${finalStatus})`,
        finalStatus,
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

    let log: HoroshopImportLogItem[];
    if (Array.isArray(respData.log)) {
      log = respData.log.map((entry: any, idx: number) =>
        this.parseHoroshopLogEntry(entry, items[idx]?.article),
      );
    } else {
      const defaultCode =
        response?.status === 'ERROR'
          ? 1
          : HOROSHOP_CONSTANTS.API_CODE_SUCCESS;
      log = items.map((item) => ({
        code: defaultCode,
        article: String(item.article),
        message: response?.status === 'ERROR' ? 'Ошибка обновления' : 'OK',
      }));
    }

    const errorCount = log.filter(
      (l) => l.code !== HOROSHOP_CONSTANTS.API_CODE_SUCCESS,
    ).length;
    const successCount = log.length - errorCount;
    const updatedCount =
      typeof respData.updated === 'number' ? respData.updated : successCount;

    return {
      success: errorCount === 0,
      total: items.length,
      updated: updatedCount,
      errors: errorCount,
      log,
      response,
    };
  }

  /**
   * Корректный разбор записи лога ответа Хорошоп API.
   * Хорошоп присылает ошибки/предупреждения в формате:
   * { article: "16", info: [{ code: 7, message: "Категория FMU не найдена..." }] }
   * Либо при успехе:
   * { article: "16", info: [{ code: 0, message: "Товар добавлен" }] }
   */
  private parseHoroshopLogEntry(
    entry: any,
    defaultArticle = '',
  ): HoroshopImportLogItem {
    const article = String(entry?.article ?? defaultArticle);

    if (Array.isArray(entry?.info) && entry.info.length > 0) {
      const successItem = entry.info.find(
        (i: any) => Number(i.code) === HOROSHOP_CONSTANTS.API_CODE_SUCCESS,
      );

      // Если есть подтверждение добавления/обновления товара (код 0), операция успешна.
      // Коды 22 (изображение загружено), 28 (галерея очищена), 11 (параметр шаблона) являются деталями/инфо.
      if (successItem) {
        return {
          code: HOROSHOP_CONSTANTS.API_CODE_SUCCESS,
          article,
          message:
            entry.info
              .map((i: any) => i.message)
              .filter(Boolean)
              .join('; ') ||
            successItem.message ||
            'OK',
        };
      }

      // Если нет кода 0, товар был отклонен (код 7: категория не найдена, ошибка шаблона и др.)
      const primaryError = entry.info[0];
      return {
        code: Number(primaryError?.code ?? 1),
        article,
        message:
          entry.info
            .map((i: any) => i.message)
            .filter(Boolean)
            .join('; ') || 'Ошибка импорта в Хорошоп',
      };
    }

    const code = Number(entry?.code ?? HOROSHOP_CONSTANTS.API_CODE_SUCCESS);
    return {
      code,
      article,
      message:
        entry?.message ||
        (code === HOROSHOP_CONSTANTS.API_CODE_SUCCESS ? 'OK' : 'Error'),
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
        errors: 0,
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

    let log: HoroshopImportLogItem[];
    if (Array.isArray(respData.log)) {
      log = respData.log.map((entry: any, idx: number) =>
        this.parseHoroshopLogEntry(entry, products[idx]?.article),
      );
    } else {
      const defaultCode =
        response?.status === 'ERROR'
          ? 1
          : HOROSHOP_CONSTANTS.API_CODE_SUCCESS;
      log = products.map((item) => ({
        code: defaultCode,
        article: String(item.article),
        message: response?.status === 'ERROR' ? 'Ошибка экспорта' : 'OK',
      }));
    }

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const item of log) {
      if (item.code !== HOROSHOP_CONSTANTS.API_CODE_SUCCESS) {
        errorCount++;
      } else {
        const msg = (item.message || '').toLowerCase();
        if (
          msg.includes('добавлен') ||
          msg.includes('створен') ||
          msg.includes('created')
        ) {
          createdCount++;
        } else {
          updatedCount++;
        }
      }
    }

    if (typeof respData.created === 'number') {
      createdCount = respData.created;
    }
    if (typeof respData.updated === 'number') {
      updatedCount = respData.updated;
    }

    return {
      success: errorCount === 0 || createdCount + updatedCount > 0,
      total: products.length,
      created: createdCount,
      updated: updatedCount,
      errors: errorCount,
      log,
      response,
    };
  }

  /**
   * Получить список категорий магазина Хорошоп через /api/pages/export/
   */
  async getCatalogCategories(
    tenant: Tenant,
  ): Promise<Array<{ id: number; title: string; fullPath: string }>> {
    if (this.isMockMode(tenant)) {
      return [
        { id: 1055, title: 'Електроніка', fullPath: 'Електроніка' },
        { id: 1009, title: 'Смартфони', fullPath: 'Електроніка/Смартфони' },
        {
          id: 1072,
          title: 'iPhone 13',
          fullPath: 'Електроніка/Смартфони/iPhone 13',
        },
      ];
    }

    const response = await this.request(tenant, 'pages/export/', {});
    const pages = response?.response?.pages || [];
    const pageMap = new Map<number, any>();
    for (const p of pages) {
      pageMap.set(p.id, p);
    }

    const getFullPath = (id: number): string => {
      const p = pageMap.get(id);
      if (!p) return '';
      const title = p.title?.ua || p.title?.ru || String(id);
      if (!p.parent || p.parent === 0 || p.parent === 1 || p.parent === 97) {
        return title;
      }
      const parentPath = getFullPath(p.parent);
      return parentPath ? `${parentPath}/${title}` : title;
    };

    const categories: Array<{ id: number; title: string; fullPath: string }> =
      [];
    for (const p of pages) {
      if (p.id === 1 || p.id === 97) continue;

      let curr = p;
      let isUnderCatalog = false;
      while (curr && curr.parent) {
        if (curr.parent === 97) {
          isUnderCatalog = true;
          break;
        }
        curr = pageMap.get(curr.parent);
      }

      if (isUnderCatalog) {
        const title = p.title?.ua || p.title?.ru || String(p.id);
        categories.push({
          id: p.id,
          title,
          fullPath: getFullPath(p.id),
        });
      }
    }

    if (categories.length === 0) {
      for (const p of pages) {
        if (p.id !== 1 && p.id !== 97) {
          const title = p.title?.ua || p.title?.ru || String(p.id);
          categories.push({
            id: p.id,
            title,
            fullPath: getFullPath(p.id),
          });
        }
      }
    }

    return categories.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  }

  /**
   * Получить список заказов из Хорошоп.
   *
   * ИСПРАВЛЕНИЕ (TASK-29): API Хорошоп ожидает числовой код статуса `stat_status`,
   * а не строковое поле `status`. Коды статусов Хорошоп:
   *   1 — Новий (new)
   *   2 — В обробці (processing)
   *   3 — Виконано (completed)
   *   4 — Скасовано (cancelled)
   *
   * Принимает как числовой `stat_status`, так и строковый алиас `status`
   * для обратной совместимости.
   */
  async getOrders(
    tenant: Tenant,
    filter: {
      date_from?: string;
      stat_status?: number;
      /** @deprecated Используйте stat_status (числовой). 'new' → 1, 'processing' → 2 */
      status?: string;
      limit?: number;
    } = {},
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
              stat_status: 1,
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
              stat_status: 2,
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

    // Маппинг строкового статуса → числовой код Хорошоп API
    const STATUS_MAP: Record<string, number> = {
      new: 1,
      processing: 2,
      completed: 3,
      cancelled: 4,
    };

    // Строим правильный payload для API Хорошоп
    const apiFilter: Record<string, any> = {};

    if (filter.date_from) {
      apiFilter.date_from = filter.date_from;
    }
    if (filter.limit) {
      apiFilter.limit = filter.limit;
    }

    // Числовой stat_status имеет приоритет над строковым status
    if (filter.stat_status !== undefined) {
      apiFilter.stat_status = filter.stat_status;
    } else if (filter.status) {
      const mappedStatus = STATUS_MAP[filter.status.toLowerCase()];
      if (mappedStatus !== undefined) {
        apiFilter.stat_status = mappedStatus;
      } else {
        // Неизвестный строковый статус — передаём как есть (на случай новых кодов API)
        this.logger.warn(
          `[${tenant.id}] getOrders: неизвестный статус «${filter.status}», передаётся как строка`,
        );
        apiFilter.stat_status = filter.status;
      }
    }

    this.logger.debug(
      `[${tenant.id}] getOrders: запрос с фильтром ${JSON.stringify(apiFilter)}`,
    );

    return this.request(tenant, 'orders/get/', apiFilter);
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

    const rawRes = await this.request(tenant, 'catalog/export/', {
      page: options.page || 1,
      limit: options.limit || 50,
    });

    const rawProducts = rawRes?.response?.products || [];
    const products = rawProducts.map((p: any) => {
      let title = '';
      if (typeof p.title === 'string') {
        title = p.title;
      } else if (p.title && typeof p.title === 'object') {
        title = p.title.ua || p.title.ru || Object.values(p.title)[0] || '';
      }
      if (!title && p.mod_title) {
        title =
          typeof p.mod_title === 'string'
            ? p.mod_title
            : p.mod_title.ua ||
              p.mod_title.ru ||
              Object.values(p.mod_title)[0] ||
              '';
      }

      let description = '';
      if (typeof p.description === 'string') {
        description = p.description;
      } else if (p.description && typeof p.description === 'object') {
        description =
          p.description.ua ||
          p.description.ru ||
          Object.values(p.description)[0] ||
          '';
      }

      let category = '';
      if (typeof p.parent === 'string') {
        category = p.parent;
      } else if (p.parent && typeof p.parent === 'object') {
        category = p.parent.value || p.parent.title || '';
      } else if (p.category) {
        category =
          typeof p.category === 'string'
            ? p.category
            : p.category.value || p.category.title || '';
      }

      const stock =
        typeof p.quantity === 'number'
          ? p.quantity
          : typeof p.stock === 'number'
            ? p.stock
            : 0;

      const price =
        typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;

      return {
        article: String(p.article || '').trim(),
        title: String(title).trim() || `Товар ${p.article}`,
        price,
        stock,
        presence:
          typeof p.presence === 'number'
            ? p.presence
            : (p.presence?.id ?? (stock > 0 ? 1 : 0)),
        barcode: p.barcode ? String(p.barcode) : undefined,
        category: category ? String(category).trim() : undefined,
        description: description ? String(description).trim() : undefined,
        images: Array.isArray(p.images) ? p.images : [],
      };
    });

    return {
      status: rawRes?.status || 'OK',
      response: {
        products,
        total: rawRes?.response?.total,
      },
    };
  }
}

