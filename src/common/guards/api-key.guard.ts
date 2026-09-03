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

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Пропускаем публичные маршруты (@Public())
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException(
        'Требуется заголовок x-api-key. Получите ключ в настройках тенанта.',
      );
    }

    // Режим 1: Master API Key — даёт доступ ко всем эндпоинтам
    const masterKey = this.configService.get<string>('apiKey');
    if (masterKey && apiKey === masterKey) {
      (request as any).isMasterKey = true;
      return true;
    }

    // Режим 2: Tenant API Key — per-tenant ключ
    const tenant = await this.tenantRepository.findOne({
      where: { apiKey, isActive: true },
    });

    if (tenant) {
      (request as any).tenant = tenant;
      return true;
    }

    this.logger.warn(
      `❌ Отказ в доступе: неверный x-api-key (${apiKey.slice(0, 8)}...)`,
    );
    throw new UnauthorizedException('Неверный или отозванный API ключ');
  }
}
