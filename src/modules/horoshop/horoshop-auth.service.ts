import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { Tenant } from '../tenant/tenant.entity';

interface CachedToken {
  token: string;
  expiresAt: number; // timestamp ms
}

@Injectable()
export class HoroshopAuthService {
  private readonly logger = new Logger(HoroshopAuthService.name);
  private readonly tokenCache = new Map<string, CachedToken>();

  /**
   * Получить действующий токен авторизации для магазина Хорошоп
   */
  async getToken(tenant: Tenant, forceRefresh = false): Promise<string> {
    if (!tenant.horoshopDomain || !tenant.horoshopLogin || !tenant.horoshopPassword) {
      throw new BadRequestException(
        `[${tenant.id}] Не настроены реквизиты Хорошоп (horoshopDomain, horoshopLogin, horoshopPassword)`,
      );
    }

    const cached = this.tokenCache.get(tenant.id);
    const now = Date.now();

    if (!forceRefresh && cached && cached.expiresAt > now + 60 * 1000) {
      return cached.token;
    }

    return this.authenticate(tenant);
  }

  /**
   * Сбросить кэш токена (например, при 401 Unauthorized)
   */
  clearToken(tenantId: string): void {
    this.tokenCache.delete(tenantId);
    this.logger.log(`[${tenantId}] Кэш токена Хорошоп сброшен`);
  }

  /**
   * Запрос нового токена через /api/auth/
   */
  private async authenticate(tenant: Tenant): Promise<string> {
    const rawDomain = tenant.horoshopDomain!.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    // Тестовый / MOCK режим
    if (rawDomain === 'mock' || rawDomain === 'test' || rawDomain.includes('mock')) {
      this.logger.log(`🧪 [${tenant.id}] Тестовый MOCK-режим: авторизация Хорошоп эмулирована успешно`);
      const mockToken = `mock_horoshop_jwt_token_${tenant.id}`;
      this.tokenCache.set(tenant.id, {
        token: mockToken,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      return mockToken;
    }

    const url = `https://${rawDomain}/api/auth/`;

    this.logger.log(`🔑 [${tenant.id}] Запрос токена Хорошоп: ${url} (login: ${tenant.horoshopLogin})`);

    try {
      const response = await axios.post(
        url,
        {
          login: tenant.horoshopLogin,
          password: tenant.horoshopPassword,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const data = response.data;
      // Horoshop API returns { status: "OK", response: { token: "..." } } or { token: "..." }
      const token = data?.response?.token || data?.token;

      if (!token) {
        this.logger.error(
          `[${tenant.id}] Ошибка авторизации Хорошоп: ответ не содержит токен`,
          JSON.stringify(data),
        );
        throw new UnauthorizedException(
          data?.message || data?.response?.message || 'Не удалось получить токен авторизации Хорошоп',
        );
      }

      // Токен обычно валиден 24 часа. Устанавливаем кэш на 23 часа.
      const ttlMs = 23 * 60 * 60 * 1000;
      this.tokenCache.set(tenant.id, {
        token,
        expiresAt: Date.now() + ttlMs,
      });

      this.logger.log(`✅ [${tenant.id}] Токен Хорошоп успешно получен и сохранен в кэше`);
      return token;
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;
      this.logger.error(
        `❌ [${tenant.id}] Сбой запроса к Horoshop API auth [${status}]:`,
        data || error.message,
      );

      throw new UnauthorizedException(
        `Ошибка аутентификации Хорошоп (${status || 'Network Error'}): ${data?.message || error.message}`,
      );
    }
  }
}
