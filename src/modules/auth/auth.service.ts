import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenant/tenant.entity';
import { AUTH_ROLES } from './auth.constants';
import { LoginResponseDto } from './dto/login-response.dto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Проверяет переданный пароль / API-ключ и определяет роль пользователя.
   * Поддерживает:
   * 1. Master API Key (суперадминистратор)
   * 2. API-ключ тенанта (клиент / магазин)
   */
  async validateKey(rawKey: string): Promise<LoginResponseDto> {
    const key = rawKey?.trim();
    if (!key) {
      throw new UnauthorizedException('Необходимо указать пароль или ключ доступа');
    }

    // 1. Проверка Master API Key
    const masterKey = this.configService.get<string>('apiKey');
    if (masterKey && key === masterKey) {
      this.logger.log('🔑 Успешная авторизация суперадминистратора по Master API Key');
      return {
        role: AUTH_ROLES.SUPERADMIN,
      };
    }

    // 2. Поиск среди магазинов (тенантов)
    const tenant = await this.tenantRepository.findOne({
      where: { apiKey: key },
    });

    if (tenant) {
      if (!tenant.isActive) {
        this.logger.warn(`⛔ Попытка входа в деактивированный магазин "${tenant.id}"`);
        throw new UnauthorizedException('Магазин деактивирован. Обратитесь к администратору');
      }

      this.logger.log(`🔑 Успешная авторизация магазина "${tenant.id}" (${tenant.name})`);
      return {
        role: AUTH_ROLES.TENANT,
        tenantId: tenant.id,
        tenantName: tenant.name,
      };
    }

    this.logger.warn(
      `❌ Неудачная попытка входа с ключом (${key.length > 8 ? `${key.slice(0, 8)}...` : '***'})`,
    );
    throw new UnauthorizedException('Неверный пароль или ключ доступа');
  }

  /**
   * Возвращает профиль текущей активной сессии из контекста AuthenticatedRequest
   */
  getProfileFromRequest(request: AuthenticatedRequest): LoginResponseDto {
    if (request.isMasterKey) {
      return {
        role: AUTH_ROLES.SUPERADMIN,
      };
    }

    if (request.tenant) {
      return {
        role: AUTH_ROLES.TENANT,
        tenantId: request.tenant.id,
        tenantName: request.tenant.name,
      };
    }

    throw new UnauthorizedException('Неавторизованный запрос');
  }
}
