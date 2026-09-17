import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Tenant } from '../src/modules/tenant/tenant.entity';
import { TenantIntegration } from '../src/modules/tenant/tenant-integration.entity';
import { ProductMapping } from '../src/modules/tenant/product-mapping.entity';

dotenv.config();

async function run() {
  console.log('🚀 Connecting to PostgreSQL Master DB on port 5433...');

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'liman_master',
    entities: [Tenant, TenantIntegration, ProductMapping],
    synchronize: true,
  });

  await dataSource.initialize();
  console.log('✅ PostgreSQL Schema synchronized successfully!');

  const sqlitePath = path.resolve(
    process.cwd(),
    process.env.SQLITE_PATH || './data/liman_master.sqlite',
  );
  if (!fs.existsSync(sqlitePath)) {
    console.log(`⚠️ SQLite database not found at ${sqlitePath}`);
    await dataSource.destroy();
    return;
  }

  const Database = require('better-sqlite3');
  const sqliteDb = new Database(sqlitePath, { readonly: true });

  const sqliteTenants = sqliteDb.prepare('SELECT * FROM tenants').all() as any[];
  console.log(`📦 Found ${sqliteTenants.length} tenants in SQLite.`);

  const tenantRepo = dataSource.getRepository(Tenant);
  const integrationRepo = dataSource.getRepository(TenantIntegration);

  for (const st of sqliteTenants) {
    let tenant = await tenantRepo.findOne({ where: { id: st.id } });
    if (!tenant) {
      tenant = tenantRepo.create({
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
        horoshopOrderWebhookEnabled:
          st.horoshopOrderWebhookEnabled !== undefined
            ? Boolean(st.horoshopOrderWebhookEnabled)
            : true,
        horoshopProductCreationWebhookEnabled: Boolean(
          st.horoshopProductCreationWebhookEnabled,
        ),
        horoshopSyncIntervalMinutes: st.horoshopSyncIntervalMinutes ?? 15,
        priceColumn: st.priceColumn ?? 'cena2',
        stockColumn: st.stockColumn ?? 'skl_k',
        syncIntervalMinutes: st.syncIntervalMinutes ?? 15,
        isActive: st.isActive !== undefined ? Boolean(st.isActive) : true,
      });
      await tenantRepo.save(tenant);
      console.log(`✅ Migrated tenant "${st.id}" to PostgreSQL.`);
    } else {
      console.log(`ℹ️ Tenant "${st.id}" already exists in PostgreSQL.`);
    }

    // Migrate or create Horoshop integration in tenant_integrations (Option 2)
    if (st.horoshopDomain) {
      let horoshopInt = await integrationRepo.findOne({
        where: { tenantId: st.id, platform: 'horoshop' },
      });
      if (!horoshopInt) {
        horoshopInt = integrationRepo.create({
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
            orderWebhookEnabled:
              st.horoshopOrderWebhookEnabled !== undefined
                ? Boolean(st.horoshopOrderWebhookEnabled)
                : true,
            productCreationWebhookEnabled: Boolean(
              st.horoshopProductCreationWebhookEnabled,
            ),
          },
          settings: {
            priceColumn: st.priceColumn ?? 'cena2',
            stockColumn: st.stockColumn ?? 'skl_k',
            syncIntervalMinutes: st.horoshopSyncIntervalMinutes ?? 15,
          },
        });
        await integrationRepo.save(horoshopInt);
        console.log(
          `✅ Created Horoshop integration "${horoshopInt.name}" (id: ${horoshopInt.id}) for tenant "${st.id}".`,
        );
      } else {
        console.log(
          `ℹ️ Horoshop integration for tenant "${st.id}" already exists (id: ${horoshopInt.id}).`,
        );
      }
    }
  }

  sqliteDb.close();
  await dataSource.destroy();
  console.log('🎉 Migration to PostgreSQL completed successfully!');
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
