import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import mysql from 'mysql2/promise';
import { Tenant } from '../tenant/tenant.entity';
import { AlertService } from '../alert/alert.service';

/**
 * Менеджер пулов соединений с базами данных MariaDB клиентов (Tenants).
 *
 * Отвечает за:
 * 1. Динамическое создание пулов соединений `mysql2/promise` по требованию (On-Demand).
 * 2. Кэширование пулов в памяти (`Map<tenantId, mysql.Pool>`) для повторного использования.
 * 3. Проверку жизнеспособности соединения (`testConnection` с замером пинга).
 * 4. Корректное закрытие пулов при остановке сервиса (`onApplicationShutdown`).
 */
@Injectable()
export class TenantConnectionManager implements OnApplicationShutdown {
  private readonly logger = new Logger(TenantConnectionManager.name);
  private readonly pools = new Map<string, mysql.Pool>();

  constructor(@Optional() private readonly alertService?: AlertService) {}

  /**
   * Получить существующий или создать новый пул соединений к MariaDB клиента
   * @param tenant Модель клиента с реквизитами подключения к MariaDB
   * @returns Пул соединений mysql.Pool
   */
  getPool(tenant: Tenant): mysql.Pool {
    const existing = this.pools.get(tenant.id);
    if (existing) {
      return existing;
    }

    this.logger.log(
      `🔌 Создаем пул соединений к MariaDB для тенанта "${tenant.id}" (${tenant.dbHost}:${tenant.dbPort}/${tenant.dbName})...`,
    );

    // Конфигурация пула с KeepAlive и таймзоной UTC
    const pool = mysql.createPool({
      host: tenant.dbHost,
      port: tenant.dbPort,
      user: tenant.dbUser,
      password: tenant.dbPassword,
      database: tenant.dbName,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      timezone: '+00:00',
    });

    this.pools.set(tenant.id, pool);
    return pool;
  }

  async testConnection(tenant: Tenant): Promise<{ success: boolean; message: string; pingMs?: number }> {
    const startTime = Date.now();
    try {
      const pool = this.getPool(tenant);
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      const pingMs = Date.now() - startTime;
      return {
        success: true,
        message: `Успешное подключение к БД "${tenant.dbName}" на ${tenant.dbHost}:${tenant.dbPort}`,
        pingMs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Ошибка соединения с БД';
      this.logger.error(
        `❌ Ошибка подключения к MariaDB тенанта "${tenant.id}":`,
        error instanceof Error ? error.message : error,
      );

      // Отправляем алерт о сбое подключения к MariaDB
      void this.alertService?.sendCritical(
        'mariadb',
        `Сбой подключения к MariaDB [${tenant.id}]`,
        `Не удалось подключиться к базе данных "${tenant.dbName}" на сервере ${tenant.dbHost}:${tenant.dbPort}`,
        error instanceof Error ? error.stack || error.message : String(error),
        tenant.id,
        { host: tenant.dbHost, port: tenant.dbPort, database: tenant.dbName },
      );

      return {
        success: false,
        message: errorMsg,
      };
    }
  }

  async closePool(tenantId: string): Promise<void> {
    const pool = this.pools.get(tenantId);
    if (pool) {
      await pool.end();
      this.pools.delete(tenantId);
      this.logger.log(`🔒 Пул соединений для тенанта "${tenantId}" закрыт`);
    }
  }

  async onApplicationShutdown() {
    this.logger.log('🛑 Закрытие всех пулов соединений с базами данных клиентов...');
    for (const [tenantId, pool] of this.pools.entries()) {
      try {
        await pool.end();
      } catch (err) {
        this.logger.error(`Ошибка при закрытии пула ${tenantId}:`, err);
      }
    }
    this.pools.clear();
  }
}
