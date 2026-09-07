import { NotFoundException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantService } from './tenant.service';
import { Tenant } from './tenant.entity';

describe('TenantService', () => {
  let service: TenantService;
  let repository: jest.Mocked<Repository<Tenant>>;

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto as any),
      save: jest.fn((entity) => Promise.resolve(entity as any)),
      remove: jest.fn((entity) => Promise.resolve(entity as any)),
    } as any;

    service = new TenantService(repository);
  });

  describe('findAll', () => {
    it('should return an array of tenants', async () => {
      const tenants: Partial<Tenant>[] = [{ id: 't1', name: 'Tenant 1' }];
      repository.find.mockResolvedValue(tenants as Tenant[]);

      const result = await service.findAll();
      expect(result).toEqual(tenants);
      expect(repository.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    });
  });

  describe('findOne', () => {
    it('should return tenant if found', async () => {
      const tenant: Partial<Tenant> = { id: 'columb', name: 'Columb Shop' };
      repository.findOne.mockResolvedValue(tenant as Tenant);

      const result = await service.findOne('columb');
      expect(result).toEqual(tenant);
    });

    it('should throw NotFoundException if tenant is not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create and save a new tenant with generated apiKey', async () => {
      repository.findOne.mockResolvedValue(null);

      const dto = {
        id: 'new-shop',
        name: 'New Shop',
        dbName: 'shop_db',
      } as any;

      const result = await service.create(dto);
      expect(result.id).toBe('new-shop');
      expect(result.apiKey).toBeDefined();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if tenant id already exists', async () => {
      repository.findOne.mockResolvedValue({ id: 'existing' } as Tenant);

      await expect(service.create({ id: 'existing', name: 'Dup' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('rotateApiKey', () => {
    it('should generate a new API key and update tenant', async () => {
      const tenant: Partial<Tenant> = { id: 'columb', apiKey: 'old-key' };
      repository.findOne.mockResolvedValue(tenant as Tenant);

      const result = await service.rotateApiKey('columb');
      expect(result.id).toBe('columb');
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).not.toBe('old-key');
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('sanitizeTenant', () => {
    it('should mask sensitive credentials with ********', () => {
      const rawTenant = {
        id: 'columb',
        name: 'Columb Shop',
        dbPassword: 'secret-db-pass',
        woocommerceConsumerSecret: 'cs_secret_123',
        rozetkaClientSecret: 'rozetka_pass',
        horoshopPassword: 'horoshop_pass',
        apiKey: 'public-uuid',
      } as Tenant;

      const sanitized = service.sanitizeTenant(rawTenant);
      expect(sanitized.dbPassword).toBe('********');
      expect(sanitized.woocommerceConsumerSecret).toBe('********');
      expect(sanitized.rozetkaClientSecret).toBe('********');
      expect(sanitized.horoshopPassword).toBe('********');
      expect(sanitized.apiKey).toBe('public-uuid');
    });
  });

  describe('update', () => {
    it('should update fields and ignore masked ******** secrets to prevent overwriting real values', async () => {
      const existingTenant: Partial<Tenant> = {
        id: 'columb',
        name: 'Old Name',
        dbPassword: 'real-secret-password',
        woocommerceConsumerSecret: 'real-cs-secret',
      };
      repository.findOne.mockResolvedValue(existingTenant as Tenant);

      const updateDto = {
        name: 'Updated Name',
        dbPassword: '********', // client sent masked value
        woocommerceConsumerSecret: '********',
      };

      const result = await service.update('columb', updateDto as any);
      expect(result.name).toBe('Updated Name');
      expect(result.dbPassword).toBe('real-secret-password');
      expect(result.woocommerceConsumerSecret).toBe('real-cs-secret');
    });
  });

  describe('remove', () => {
    it('should remove tenant and return success', async () => {
      const tenant: Partial<Tenant> = { id: 'to-delete' };
      repository.findOne.mockResolvedValue(tenant as Tenant);

      const result = await service.remove('to-delete');
      expect(result).toEqual({ success: true });
      expect(repository.remove).toHaveBeenCalledWith(tenant);
    });
  });
});
