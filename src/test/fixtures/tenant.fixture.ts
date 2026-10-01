import { Tenant } from '../../modules/tenant/tenant.entity';

/**
 * Фабрика мок-объекта Tenant для unit и e2e тестов.
 * Предоставляет полный набор валидных дефолтных полей сущности Tenant
 * с возможностью переопределения любых свойств.
 */
export function createMockTenant(overrides: Partial<Tenant> = {}): Tenant {
  const defaultTenant: Tenant = {
    id: 'test-tenant',
    name: 'Test Tenant Shop',
    dbHost: '127.0.0.1',
    dbPort: 3306,
    dbName: 'test_db',
    dbUser: 'test_user',
    dbPassword: 'test_password',
    apiKey: 'test-api-key-12345',
    publicBaseUrl: 'http://localhost:3000',
    isActive: true,
    lastSyncAt: new Date(),
    priceColumn: 'cena2',
    stockColumn: 'skl_k',
    syncIntervalMinutes: 15,

    // Prom.ua
    promShopTitle: 'Test Prom Shop',
    promApiKey: 'test-prom-key',
    promExportEnabled: true,
    promOrderWebhookEnabled: true,
    promCreateOrderDocumentEnabled: false,
    promSyncIntervalMinutes: 15,
    promWebhookSecret: null,

    // WooCommerce
    woocommerceUrl: 'https://example-shop.com',
    woocommerceConsumerKey: 'ck_test_123',
    woocommerceConsumerSecret: 'cs_test_456',
    woocommerceSyncEnabled: true,
    woocommerceImportEnabled: true,
    woocommerceOrderWebhookEnabled: true,
    woocommerceCreateOrderDocumentEnabled: false,
    woocommerceSyncIntervalMinutes: 15,

    // Rozetka
    rozetkaClientId: 'rozetka_user',
    rozetkaClientSecret: 'rozetka_secret',
    rozetkaExportEnabled: true,

    // Horoshop
    horoshopShopTitle: 'Test Horoshop',
    horoshopDomain: 'shop.horoshop.ua',
    horoshopLogin: 'horoshop_user',
    horoshopPassword: 'horoshop_password',
    horoshopExportEnabled: true,
    horoshopOrderWebhookEnabled: true,
    horoshopProductCreationWebhookEnabled: false,
    horoshopCreateOrderDocumentEnabled: false,
    horoshopSyncIntervalMinutes: 15,

    // Relations & timestamps
    integrations: [],
    productMappings: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  return {
    ...defaultTenant,
    ...overrides,
  };
}
