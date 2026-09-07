import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Tenant } from '../../modules/tenant/tenant.entity';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

/**
 * Глобальный Guard для авторизации запросов по HTTP-заголовку `x-api-key`.
 *
 * Поддерживает 3 режима работы:
 * 1. Публичные маршруты: методы/контроллеры с декоратором `@Public()` пропускаются без проверки.
 * 2. Master API Key: глобальный ключ администратора из конфигурации (`apiKey`), дающий полный доступ ко всем тенантам.
 * 3. Tenant API Key: индивидуальный ключ магазина из SQLite таблицы `tenants`.
 *    При успешной проверке объект тенанта сохраняется в `request.tenant`.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Проверка прав доступа входящего HTTP-запроса
   * @param context Контекст выполнения NestJS
   * @returns true если запрос авторизован, иначе выбрасывает UnauthorizedException
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Пропускаем публичные маршруты, помеченные декоратором @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException(
        'Требуется заголовок x-api-key. Получите ключ в настройках тенанта.',
      );
    }

    // Режим 1: Master API Key — даёт полный доступ ко всем эндпоинтам и тенантам
    const masterKey = this.configService.get<string>('apiKey');
    if (masterKey && apiKey === masterKey) {
      request.isMasterKey = true;
      return true;
    }

    // Режим 2: Tenant API Key — индивидуальный ключ тенанта
    const tenant = await this.tenantRepository.findOne({
      where: { apiKey, isActive: true },
    });

    if (tenant) {
      request.tenant = tenant;

      // Защита от IDOR: если в маршруте указан :tenantId, проверяем соответствие ключа
      const requestedTenantId = request.params?.tenantId;
      if (requestedTenantId && requestedTenantId !== tenant.id) {
        this.logger.warn(
          `⛔ [IDOR Предотвращен] Тенант "${tenant.id}" попытался получить доступ к ресурсам "${requestedTenantId}"`,
        );
        throw new UnauthorizedException(
          `Доступ запрещен: ваш API-ключ принадлежит тенанту "${tenant.id}", а не "${requestedTenantId}"`,
        );
      }

      // Ограничение доступа к эндпоинтам управления тенантами (/api/v1/tenants):
      // Обычный ключ тенанта НЕ может просматривать всех клиентов, создавать или удалять тенантов
      const path = request.path || request.url;
      if (path.includes('/api/v1/tenants')) {
        // Разрешаем тенанту только чтение или обновление своего собственного профиля (/tenants/:id где id === tenant.id)
        const targetId = request.params?.id;
        const isSelfProfile = targetId === tenant.id && (request.method === 'GET' || request.method === 'PATCH');
        if (!isSelfProfile) {
          this.logger.warn(
            `⛔ [Privilege Escalation Предотвращен] Тенант "${tenant.id}" попытался выполнить ${request.method} ${path}`,
          );
          throw new UnauthorizedException('Управление списком тенантов доступно только по Master API Key');
        }
      }

      return true;
    }

    this.logger.warn(
      `❌ Отказ в доступе: неверный x-api-key (${apiKey.slice(0, 8)}...)`,
    );
    throw new UnauthorizedException('Неверный или отозванный API ключ');
  }
}
