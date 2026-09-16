import { Test, TestingModule } from '@nestjs/testing';
import { AdminTenantsController } from './admin-tenants.controller';
import { TenantService } from './tenant.service';
import { Tenant } from './tenant.entity';

describe('AdminTenantsController', () => {
  let controller: AdminTenantsController;
  let tenantService: jest.Mocked<TenantService>;

  const mockTenant: Tenant = {
    id: 'columb',
    name: 'Columb Shop',
    dbHost: '127.0.0.1',
    dbPort: 3306,
    dbName: 'columbDB',
    dbUser: 'root',
    dbPassword: 'secretPassword123',
    apiKey: 'original-api-key-uuid',
    promApiKey: 'prom-secret-key',
    promExportEnabled: true,
    woocommerceUrl: 'https://woo.example.com',
    woocommerceConsumerKey: 'ck_123',
    woocommerceConsumerSecret: 'cs_secret_456',
    woocommerceSyncEnabled: true,
    woocommerceImportEnabled: false,
    woocommerceSyncIntervalMinutes: 15,
    rozetkaClientId: 'rozetka-user',
    rozetkaClientSecret: 'rozetka-secret',
    rozetkaExportEnabled: false,
    horoshopDomain: 'columb.horoshop.ua',
    horoshopLogin: 'liman_api',
    horoshopPassword: 'horoshopPassword789',
    horoshopExportEnabled: true,
    horoshopSyncIntervalMinutes: 15,
    priceColumn: 'cena2',
    stockColumn: 'skl_k',
    syncIntervalMinutes: 15,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn().mockResolvedValue([mockTenant]),
      findOne: jest.fn().mockResolvedValue(mockTenant),
      create: jest.fn().mockResolvedValue(mockTenant),
      update: jest.fn().mockResolvedValue(mockTenant),
      rotateApiKey: jest.fn().mockResolvedValue({ id: 'columb', apiKey: 'new-rotated-uuid' }),
      remove: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTenantsController],
      providers: [
        {
          provide: TenantService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<AdminTenantsController>(AdminTenantsController);
    tenantService = module.get(TenantService);
  });

  describe('findAll', () => {
    it('должен маскировать все чувствительные данные (пароли и API-ключи) символами ••••••••', async () => {
      const result = await controller.findAll();

      expect(result).toHaveLength(1);
      const tenant = result[0];
      expect(tenant.id).toBe('columb');
      expect(tenant.name).toBe('Columb Shop');

      // Проверяем маскирование паролей и секретов
      expect(tenant.dbPassword).toBe('••••••••');
      expect(tenant.horoshopPassword).toBe('••••••••');
      expect(tenant.promApiKey).toBe('••••••••');
      expect(tenant.rozetkaClientSecret).toBe('••••••••');
      expect(tenant.woocommerceConsumerSecret).toBe('••••••••');
      expect(tenant.apiKey).toBe('••••••••');
    });
  });

  describe('revealCredentials', () => {
    it('должен возвращать реальные пароли и ключи для уполномоченного супер-админа', async () => {
      const creds = await controller.revealCredentials('columb');

      expect(tenantService.findOne).toHaveBeenCalledWith('columb');
      expect(creds).toEqual({
        id: 'columb',
        dbPassword: 'secretPassword123',
        horoshopPassword: 'horoshopPassword789',
        promApiKey: 'prom-secret-key',
        rozetkaClientSecret: 'rozetka-secret',
        woocommerceConsumerSecret: 'cs_secret_456',
        apiKey: 'original-api-key-uuid',
      });
    });
  });

  describe('rotateKey', () => {
    it('должен вызывать rotateApiKey у TenantService', async () => {
      const res = await controller.rotateKey('columb');

      expect(tenantService.rotateApiKey).toHaveBeenCalledWith('columb');
      expect(res).toEqual({ id: 'columb', apiKey: 'new-rotated-uuid' });
    });
  });

  describe('CRUD operations', () => {
    it('create должен сохранять клиента и возвращать его с маскированными полями', async () => {
      const res = await controller.create({
        id: 'newshop',
        name: 'New Shop',
        dbHost: '127.0.0.1',
        dbPort: 3306,
        dbName: 'newdb',
        dbUser: 'root',
        dbPassword: 'superSecretPassword',
      });

      expect(tenantService.create).toHaveBeenCalled();
      expect(res.dbPassword).toBe('••••••••');
    });

    it('update должен вызывать tenantService.update и возвращать маскированного клиента', async () => {
      const res = await controller.update('columb', { name: 'Updated Columb' });

      expect(tenantService.update).toHaveBeenCalledWith('columb', { name: 'Updated Columb' });
      expect(res.dbPassword).toBe('••••••••');
    });

    it('remove должен удалять клиента', async () => {
      const res = await controller.remove('columb');

      expect(tenantService.remove).toHaveBeenCalledWith('columb');
      expect(res).toEqual({ success: true });
    });
  });
});
