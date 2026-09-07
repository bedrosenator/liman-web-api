import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Tenant } from '../tenant/tenant.entity';

interface RozetkaTokenCache {
  accessToken: string;
  expiresAt: number; // timestamp ms
}

/**
 * Сервис авторизации в Rozetka Seller API v2
 * Получает и кеширует JWT access_token по client_id / client_secret
 */
@Injectable()
export class RozetkaAuthService {
  private readonly logger = new Logger(RozetkaAuthService.name);
  private readonly AUTH_URL = 'https://api.seller.rozetka.com.ua/sites';
  private readonly TOKEN_BUFFER_MS = 60_000; // обновлять за 1 минуту до истечения

  // Кеш токенов по tenantId
  private readonly tokenCache = new Map<string, RozetkaTokenCache>();

  /**
   * Получить действующий access_token для тенанта.
   * При необходимости автоматически обновляет токен.
   */
  async getAccessToken(tenant: Tenant): Promise<string> {
    if (!tenant.rozetkaClientId || !tenant.rozetkaClientSecret) {
      throw new Error(
        `[${tenant.id}] Rozetka credentials не настроены (rozetkaClientId / rozetkaClientSecret)`,
      );
    }

    const cached = this.tokenCache.get(tenant.id);
    if (cached && cached.expiresAt - this.TOKEN_BUFFER_MS > Date.now()) {
      return cached.accessToken;
    }

    return this.fetchNewToken(tenant);
  }

  private async fetchNewToken(tenant: Tenant): Promise<string> {
    this.logger.log(`🔑 [${tenant.id}] Запрашиваем новый Rozetka JWT token...`);

    try {
      const response = await axios.post(
        this.AUTH_URL,
        {
          username: tenant.rozetkaClientId,
          password: tenant.rozetkaClientSecret,
        },
        {
          timeout: 15_000,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      // Rozetka API v2 возвращает: { success: true, content: { access_token, expires_in } }
      const content = response.data?.content ?? response.data;
      const accessToken: string = content?.access_token ?? content?.token;
      const expiresIn: number = content?.expires_in ?? 3600; // секунды

      if (!accessToken) {
        throw new Error(`Не удалось извлечь access_token из ответа: ${JSON.stringify(response.data)}`);
      }

      const expiresAt = Date.now() + expiresIn * 1000;
      this.tokenCache.set(tenant.id, { accessToken, expiresAt });

      this.logger.log(
        `✅ [${tenant.id}] Rozetka token получен, действителен ${Math.round(expiresIn / 60)} минут`,
      );
      return accessToken;
    } catch (err) {
      this.logger.error(
        `❌ [${tenant.id}] Ошибка авторизации Rozetka:`,
        axios.isAxiosError(err) ? (err.response?.data ?? err.message) : err,
      );
      throw err;
    }
  }

  /**
   * Очистить кеш токена (при ошибке 401 от API)
   */
  invalidateToken(tenantId: string): void {
    this.tokenCache.delete(tenantId);
    this.logger.warn(`⚠️ [${tenantId}] Rozetka token инвалидирован`);
  }
}
