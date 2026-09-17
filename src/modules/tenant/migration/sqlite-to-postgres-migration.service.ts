import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Tenant } from '../tenant.entity';
import { TenantIntegration } from '../tenant-integration.entity';

@Injectable()
export class SqliteToPostgresMigrationService implements OnModuleInit {
  private readonly logger = new Logger(SqliteToPostgresMigrationService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantIntegration)
    private readonly integrationRepo: Repository<TenantIntegration>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const dbType = this.configService.get<string>('database.type');
    if (dbType !== 'postgres') {
      return;
    }

    try {
      await this.runMigration();
    } catch (error) {
      this.logger.error(
        `Migration from SQLite to Postgres encountered an error: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  async runMigration(): Promise<void> {
    const sqlitePath =
      this.configService.get<string>('sqlite.databasePath') ??
      './data/liman_master.sqlite';
    const resolvedPath = path.resolve(process.cwd(), sqlitePath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger.log(`No SQLite database found at ${resolvedPath}, skipping migration.`);
      return;
    }

    // Dynamically require better-sqlite3 to avoid loading in production if not needed
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      this.logger.warn('better-sqlite3 is not available, skipping SQLite data migration.');
      return;
    }

    const sqliteDb = new Database(resolvedPath, { readonly: true });
    try {
      const tableCheck = sqliteDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'")
        .get();
      if (!tableCheck) {
        return;
      }

      const sqliteTenants = sqliteDb.prepare('SELECT * FROM tenants').all() as any[];
      if (!sqliteTenants || sqliteTenants.length === 0) {
        return;
      }

      this.logger.log(
        `[Migration] Found ${sqliteTenants.length} tenants in SQLite. Syncing to PostgreSQL...`,
      );

      for (const st of sqliteTenants) {
        let existingTenant = await this.tenantRepo.findOne({ where: { id: st.id } });

        if (!existingTenant) {
          const newTenant = this.tenantRepo.create({
            id: st.id,
            name: st.name,
            dbHost: st.dbHost ?? '127.0.0.1',
            dbPort: st.dbPort ?? 3306,
            dbName: st.dbName ?? `${st.id}DB`,
            dbUser: st.dbUser ?? 'root',
            dbPassword: st.dbPassword ?? '',
            apiKey: st.apiKey ?? null,
            promApiKey: st.promApiKey ?? null,
            promExportEnabled: Boolean(st.promExportEnabled),
            woocommerceUrl: st.woocommerceUrl ?? null,
            woocommerceConsumerKey: st.woocommerceConsumerKey ?? null,
            woocommerceConsumerSecret: st.woocommerceConsumerSecret ?? null,
            woocommerceSyncEnabled: Boolean(st.woocommerceSyncEnabled),
            woocommerceImportEnabled: Boolean(st.woocommerceImportEnabled),
            woocommerceSyncIntervalMinutes: st.woocommerceSyncIntervalMinutes ?? 15,
            rozetkaClientId: st.rozetkaClientId ?? null,
            rozetkaClientSecret: st.rozetkaClientSecret ?? null,
            rozetkaExportEnabled: Boolean(st.rozetkaExportEnabled),
            horoshopShopTitle: st.horoshopShopTitle ?? null,
            horoshopDomain: st.horoshopDomain ?? null,
            horoshopLogin: st.horoshopLogin ?? null,
            horoshopPassword: st.horoshopPassword ?? null,
            horoshopExportEnabled: Boolean(st.horoshopExportEnabled),
            horoshopOrderWebhookEnabled: st.horoshopOrderWebhookEnabled !== undefined ? Boolean(st.horoshopOrderWebhookEnabled) : true,
            horoshopProductCreationWebhookEnabled: Boolean(st.horoshopProductCreationWebhookEnabled),
            horoshopSyncIntervalMinutes: st.horoshopSyncIntervalMinutes ?? 15,
            priceColumn: st.priceColumn ?? 'cena2',
            stockColumn: st.stockColumn ?? 'skl_k',
            syncIntervalMinutes: st.syncIntervalMinutes ?? 15,
            isActive: st.isActive !== undefined ? Boolean(st.isActive) : true,
          });
          existingTenant = await this.tenantRepo.save(newTenant);
          this.logger.log(`[Migration] Migrated tenant ${st.id} to PostgreSQL.`);
        }

        // Migrate integrations to tenant_integrations (Option 2)
        if (st.horoshopDomain) {
          const existingHoroshop = await this.integrationRepo.findOne({
            where: { tenantId: st.id, platform: 'horoshop' },
          });
          if (!existingHoroshop) {
            const horoshopIntegration = this.integrationRepo.create({
              tenantId: st.id,
              platform: 'horoshop',
              name: st.horoshopShopTitle || `${st.name} (Хорошоп)`,
              isActive: true,
              syncEnabled: Boolean(st.horoshopExportEnabled),
              credentials: {
                domain: st.horoshopDomain,
                login: st.horoshopLogin,
                password: st.horoshopPassword,
                shopTitle: st.horoshopShopTitle || st.name,
                orderWebhookEnabled: st.horoshopOrderWebhookEnabled !== undefined ? Boolean(st.horoshopOrderWebhookEnabled) : true,
                productCreationWebhookEnabled: Boolean(st.horoshopProductCreationWebhookEnabled),
              },
              settings: {
                priceColumn: st.priceColumn ?? 'cena2',
                stockColumn: st.stockColumn ?? 'skl_k',
                syncIntervalMinutes: st.horoshopSyncIntervalMinutes ?? 15,
              },
            });
            await this.integrationRepo.save(horoshopIntegration);
            this.logger.log(
              `[Migration] Created Horoshop integration in tenant_integrations for tenant "${st.id}".`,
            );
          }
        }

        if (st.promApiKey) {
          const existingProm = await this.integrationRepo.findOne({
            where: { tenantId: st.id, platform: 'prom' },
          });
          if (!existingProm) {
            const promIntegration = this.integrationRepo.create({
              tenantId: st.id,
              platform: 'prom',
              name: `${st.name} (Prom.ua)`,
              isActive: true,
              syncEnabled: Boolean(st.promExportEnabled),
              credentials: { apiKey: st.promApiKey },
              settings: { priceColumn: st.priceColumn, stockColumn: st.stockColumn },
            });
            await this.integrationRepo.save(promIntegration);
          }
        }

        if (st.woocommerceUrl) {
          const existingWoo = await this.integrationRepo.findOne({
            where: { tenantId: st.id, platform: 'woocommerce' },
          });
          if (!existingWoo) {
            const wooIntegration = this.integrationRepo.create({
              tenantId: st.id,
              platform: 'woocommerce',
              name: `${st.name} (WooCommerce)`,
              isActive: true,
              syncEnabled: Boolean(st.woocommerceSyncEnabled),
              credentials: {
                url: st.woocommerceUrl,
                consumerKey: st.woocommerceConsumerKey,
                consumerSecret: st.woocommerceConsumerSecret,
              },
              settings: {
                priceColumn: st.priceColumn,
                stockColumn: st.stockColumn,
                syncIntervalMinutes: st.woocommerceSyncIntervalMinutes ?? 15,
              },
            });
            await this.integrationRepo.save(wooIntegration);
          }
        }

        if (st.rozetkaClientId) {
          const existingRozetka = await this.integrationRepo.findOne({
            where: { tenantId: st.id, platform: 'rozetka' },
          });
          if (!existingRozetka) {
            const rozetkaIntegration = this.integrationRepo.create({
              tenantId: st.id,
              platform: 'rozetka',
              name: `${st.name} (Rozetka)`,
              isActive: true,
              syncEnabled: Boolean(st.rozetkaExportEnabled),
              credentials: {
                clientId: st.rozetkaClientId,
                clientSecret: st.rozetkaClientSecret,
              },
              settings: { priceColumn: st.priceColumn, stockColumn: st.stockColumn },
            });
            await this.integrationRepo.save(rozetkaIntegration);
          }
        }
      }

      this.logger.log(`[Migration] SQLite to PostgreSQL migration completed successfully.`);
    } finally {
      sqliteDb.close();
    }
  }
}
