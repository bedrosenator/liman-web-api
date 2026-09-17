import { HoroshopSyncService } from './horoshop-sync.service';
import { LimanService } from '../liman/liman.service';
import { HoroshopApiClient } from './horoshop-api.client';
import { Tenant } from '../tenant/tenant.entity';

describe('HoroshopSyncService', () => {
  let service: HoroshopSyncService;
  let limanService: jest.Mocked<LimanService>;
  let horoshopClient: jest.Mocked<HoroshopApiClient>;
  let tenantService: jest.Mocked<any>;

  const mockTenant: Tenant = {
    id: 'columb',
    name: 'Columb Shop',
    horoshopDomain: 'test.horoshop.ua',
    horoshopLogin: 'admin',
    horoshopPassword: 'password',
  } as any;

  beforeEach(() => {
    limanService = {
      getProducts: jest.fn(),
      deductStock: jest.fn(),
    } as any;

    horoshopClient = {
      updateStocksAndPrices: jest.fn(),
      getOrders: jest.fn(),
    } as any;

    tenantService = {
      findOne: jest.fn().mockResolvedValue(mockTenant),
      update: jest.fn().mockResolvedValue(mockTenant),
    };

    service = new HoroshopSyncService(
      limanService,
      horoshopClient,
      tenantService,
    );
  });

  describe('syncPricesAndStocks', () => {
    it('should batch update prices and stocks to Horoshop', async () => {
      limanService.getProducts.mockResolvedValueOnce({
        items: [
          { tcod: 101, price: 99.9, stock: 5, isAvailable: true },
          { tcod: 102, price: 150, stock: 0, isAvailable: false },
        ] as any,
        total: 2,
        page: 1,
        limit: 100,
      });

      horoshopClient.updateStocksAndPrices.mockResolvedValue({
        success: true,
        updated: 2,
      } as any);

      const result = await service.syncPricesAndStocks(mockTenant, {
        batchSize: 100,
      });

      expect(result.processed).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(horoshopClient.updateStocksAndPrices).toHaveBeenCalledWith(
        mockTenant,
        [
          expect.objectContaining({ article: '101', price: 99.9, stock: 5, presence: true }),
          expect.objectContaining({ article: '102', price: 150, stock: 0, presence: false }),
        ],
      );
    });

    it('should save product mappings and handle Horoshop response.log errors', async () => {
      const mockIntegration = {
        id: 'integ-uuid-1',
        tenantId: 'columb',
        platform: 'horoshop',
        name: 'Horoshop Store',
        isActive: true,
      };

      const productMappingService: any = {
        getIntegrations: jest.fn().mockResolvedValue([mockIntegration]),
        getIntegration: jest.fn().mockResolvedValue(mockIntegration),
        resolveActiveIntegration: jest.fn().mockResolvedValue(mockIntegration),
        findOrCreateIntegration: jest.fn().mockResolvedValue(mockIntegration),
        saveBatchMappings: jest.fn().mockResolvedValue(2),
        updateIntegration: jest.fn().mockResolvedValue(mockIntegration),
        getMappingsStats: jest.fn().mockResolvedValue({ total: 2, synced: 1, error: 1 }),
      };

      const syncServiceWithMappings = new HoroshopSyncService(
        limanService,
        horoshopClient,
        tenantService,
        productMappingService,
      );

      limanService.getProducts.mockResolvedValueOnce({
        items: [
          { tcod: 101, price: 99.9, stock: 5, name: 'Item 1' },
          { tcod: 102, price: 150, stock: 2, name: 'Item 2' },
        ] as any,
        total: 2,
        page: 1,
        limit: 100,
      });

      horoshopClient.updateStocksAndPrices.mockResolvedValue({
        success: true,
        updated: 1,
        total: 2,
        log: [
          { code: 0, article: '101', message: 'OK' },
          { code: 7, article: '102', message: 'Parent category missing' },
        ],
        response: {},
      });

      const result = await syncServiceWithMappings.syncPricesAndStocks(mockTenant, {
        batchSize: 100,
        integrationId: 'integ-uuid-1',
      });

      expect(result.processed).toBe(2);
      expect(result.updated).toBe(1);
      expect(result.integrationId).toBe('integ-uuid-1');

      expect(productMappingService.saveBatchMappings).toHaveBeenCalledWith([
        expect.objectContaining({
          tenantId: 'columb',
          integrationId: 'integ-uuid-1',
          limanTcod: 101,
          externalArticle: '101',
          syncStatus: 'synced',
          lastSyncError: null,
        }),
        expect.objectContaining({
          tenantId: 'columb',
          integrationId: 'integ-uuid-1',
          limanTcod: 102,
          externalArticle: '102',
          syncStatus: 'error',
          lastSyncError: 'Parent category missing',
        }),
      ]);

      const stats = await syncServiceWithMappings.getMappingStats('columb', 'integ-uuid-1');
      expect(stats.total).toBe(2);
      expect(stats.synced).toBe(1);
      expect(stats.error).toBe(1);
    });
  });

  describe('syncOrders', () => {
    it('should poll orders and deduct stock with deduplication', async () => {
      horoshopClient.getOrders.mockResolvedValue({
        status: 'OK',
        response: {
          orders: [
            {
              id: 'HORO-1001',
              products: [{ article: '251', quantity: 2 }],
            },
          ],
        },
      } as any);

      limanService.deductStock.mockResolvedValue({
        success: true,
        tcod: 251,
        oldStock: 10,
        newStock: 8,
        deducted: 2,
      });

      const firstSync = await service.syncOrders(mockTenant);
      expect(firstSync.processedOrders).toBe(1);
      expect(firstSync.skippedOrders).toBe(0);
      expect(firstSync.itemsDeducted).toHaveLength(1);
      expect(firstSync.itemsDeducted[0]).toEqual(
        expect.objectContaining({
          orderId: 'HORO-1001',
          tcod: 251,
          qty: 2,
          oldStock: 10,
          newStock: 8,
        }),
      );
      expect(limanService.deductStock).toHaveBeenCalledWith(mockTenant, 251, 2);

      // Second sync of the same order should be skipped due to deduplication
      const secondSync = await service.syncOrders(mockTenant);
      expect(secondSync.processedOrders).toBe(0);
      expect(secondSync.skippedOrders).toBe(1);
      expect(secondSync.itemsDeducted).toHaveLength(0);
    });
  });
});
