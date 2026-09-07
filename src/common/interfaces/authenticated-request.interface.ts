import type { Request } from 'express';
import { Tenant } from '../../modules/tenant/tenant.entity';

/**
 * Расширенный интерфейс входящего HTTP-запроса Express,
 * содержащий типизированные данные авторизации от ApiKeyGuard.
 */
export interface AuthenticatedRequest extends Request {
  /**
   * Модель авторизованного тенанта (заполняется при авторизации по ключу тенанта)
   */
  tenant?: Tenant;

  /**
   * Флаг успешной авторизации по глобальному Master API Key
   */
  isMasterKey?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      isMasterKey?: boolean;
    }
  }
}
