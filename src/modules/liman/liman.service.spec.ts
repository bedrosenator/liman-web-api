import { LimanService } from './liman.service';
import { TenantConnectionManager } from './tenant-connection.manager';
import { Tenant } from '../tenant/tenant.entity';

describe('LimanService', () => {
  let service: LimanService;
  let connectionManager: jest.Mocked<TenantConnectionManager>;
  let mockPool: any;

  const mockTenant: Tenant = {
    id: 'columb',
    name: 'Columb Shop',
    dbHost: '127.0.0.1',
    dbPort: 3306,
    dbName: 'columbDB',
    dbUser: 'root',
    dbPassword: 'password',
    priceColumn: 'cena2',
    stockColumn: 'skl_k',
    syncIntervalMinutes: 15,
    isActive: true,
    promExportEnabled: false,
    woocommerceSyncEnabled: false,
    woocommerceSyncIntervalMinutes: 15,
    rozetkaExportEnabled: false,
    horoshopExportEnabled: false,
    horoshopSyncIntervalMinutes: 15,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      execute: jest.fn(),
    };

    connectionManager = {
      getPool: jest.fn().mockReturnValue(mockPool),
      testConnection: jest.fn().mockResolvedValue({
        success: true,
        message: 'Успешное подключение к БД "columbDB"',
        pingMs: 5,
      }),
    } as any;

    service = new LimanService(connectionManager);
  });

  describe('ping', () => {
    it('should ping MariaDB pool and measure response time', async () => {
      const result = await service.ping(mockTenant);
      expect(result.success).toBe(true);
      expect(result.message).toContain('columbDB');
      expect(typeof result.pingMs).toBe('number');
      expect(connectionManager.testConnection).toHaveBeenCalledWith(mockTenant);
    });
  });

  describe('SQL Identifier Sanitization (sanitizeIdentifier)', () => {
    it('should accept valid column identifiers', () => {
      const result = (service as any).sanitizeIdentifier('cena5', 'cena2');
      expect(result).toBe('cena5');
    });

    it('should reject malicious injection strings and return safe fallback', () => {
      const malicious = 'skl_k`; DROP TABLE name2; --';
      const result = (service as any).sanitizeIdentifier(malicious, 'skl_k');
      expect(result).toBe('skl_k');
    });

    it('should fallback when identifier is empty or undefined', () => {
      expect((service as any).sanitizeIdentifier(null, 'skl_k')).toBe('skl_k');
      expect((service as any).sanitizeIdentifier('', 'skl_k')).toBe('skl_k');
      expect((service as any).sanitizeIdentifier('   ', 'skl_k')).toBe('skl_k');
    });
  });

  describe('deductStock', () => {
    it('should deduct requested quantity from existing stock atomically', async () => {
      // Mock SELECT current stock
      mockPool.query.mockResolvedValueOnce([[{ currStock: 50 }]]);
      // Mock UPDATE query
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.deductStock(mockTenant, 251, 10);
      expect(result.success).toBe(true);
      expect(result.oldStock).toBe(50);
      expect(result.newStock).toBe(40);
      expect(result.deducted).toBe(10);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE `name2ost` SET `skl_k` = ? WHERE tcod = ?',
        ),
        [40, 251],
      );
    });

    it('should prevent negative stock when requested quantity exceeds available stock', async () => {
      mockPool.query.mockResolvedValueOnce([[{ currStock: 3 }]]);
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.deductStock(mockTenant, 251, 10);
      expect(result.success).toBe(true);
      expect(result.oldStock).toBe(3);
      expect(result.newStock).toBe(0);
      expect(result.deducted).toBe(3);
    });

    it('should insert stock record if not found', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // No rows
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.deductStock(mockTenant, 999, 5);
      expect(result.oldStock).toBe(0);
      expect(result.newStock).toBe(0);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO `name2ost`'),
        [999, 0],
      );
    });
  });

  describe('updateStock', () => {
    it('should set exact stock in MariaDB', async () => {
      mockPool.query.mockResolvedValueOnce([[{ currStock: 20 }]]);
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.updateStock(mockTenant, 101, 75);
      expect(result.success).toBe(true);
      expect(result.oldStock).toBe(20);
      expect(result.newStock).toBe(75);
    });
  });

  describe('getProductImage', () => {
    it('should return null if photo does not exist', async () => {
      mockPool.query.mockResolvedValueOnce([[]]);

      const result = await service.getProductImage(mockTenant, 123, 1);
      expect(result).toBeNull();
    });

    it('should detect PNG mime type by magic bytes', async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      mockPool.query.mockResolvedValueOnce([[{ photoData: pngBuffer }]]);

      const result = await service.getProductImage(mockTenant, 123, 1);
      expect(result).not.toBeNull();
      expect(result?.mimeType).toBe('image/png');
    });

    it('should detect WebP mime type by magic bytes', async () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      ]);
      mockPool.query.mockResolvedValueOnce([[{ photoData: webpBuffer }]]);

      const result = await service.getProductImage(mockTenant, 123, 1);
      expect(result).not.toBeNull();
      expect(result?.mimeType).toBe('image/webp');
    });
  });

  describe('resolveCategoryGroup', () => {
    it('should return categoryGroup directly if provided', async () => {
      const result = await (service as any).resolveCategoryGroup(
        mockTenant,
        '0205',
      );
      expect(result).toBe('0205');
    });

    it('should match existing category by exact name', async () => {
      mockPool.query.mockResolvedValueOnce([[{ group: '01' }]]);
      const result = await (service as any).resolveCategoryGroup(
        mockTenant,
        undefined,
        'НАПИТКИ',
      );
      expect(result).toBe('01');
    });

    it('should create new root category and child category for hierarchical path', async () => {
      // 1. exact match check -> not found
      mockPool.query.mockResolvedValueOnce([[]]);
      // 2. check root 'Електроніка' -> not found
      mockPool.query.mockResolvedValueOnce([[]]);
      // 3. get all roots for new root group -> return empty
      mockPool.query.mockResolvedValueOnce([[]]);
      // 4. insert root category -> success
      mockPool.query.mockResolvedValueOnce([{ insertId: 1 }]);
      // 5. check child 'Смартфони' under '30' -> not found
      mockPool.query.mockResolvedValueOnce([[]]);
      // 6. get children under '30' -> empty
      mockPool.query.mockResolvedValueOnce([[]]);
      // 7. insert child category -> success
      mockPool.query.mockResolvedValueOnce([{ insertId: 2 }]);

      const result = await (service as any).resolveCategoryGroup(
        mockTenant,
        undefined,
        'Електроніка / Смартфони',
      );
      expect(result).toBe('3001');
    });

    it('should return cached group on subsequent calls without querying DB', async () => {
      mockPool.query.mockResolvedValueOnce([[{ group: '05' }]]);

      const result1 = await (service as any).resolveCategoryGroup(
        mockTenant,
        undefined,
        'ОДЯГ',
      );
      expect(result1).toBe('05');
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      // Second call with same path should hit categoryCache
      const result2 = await (service as any).resolveCategoryGroup(
        mockTenant,
        undefined,
        'ОДЯГ',
      );
      expect(result2).toBe('05');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should safely limit category code length when parent code reaches maximum', async () => {
      const parentWithMaxLen = '1234567890'; // 10 chars
      const nextGroup = await (service as any).generateNextCategoryGroup(
        mockPool,
        parentWithMaxLen,
      );
      expect(nextGroup).toBe(parentWithMaxLen);
    });
  });
});

