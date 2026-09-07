import { WoocommerceSyncService } from './woocommerce-sync.service';
import { LimanService } from '../liman/liman.service';
import { WoocommerceApiClient } from './woocommerce-api.client';
import { Tenant } from '../tenant/tenant.entity';

describe('WoocommerceSyncService', () => {
  let service: WoocommerceSyncService;
  let limanService: jest.Mocked<LimanService>;
  let wooClient: jest.Mocked<WoocommerceApiClient>;

  const mockTenant: Tenant = {
    id: 'columb',
    name: 'Columb Shop',
    woocommerceUrl: 'http://localhost:8080',
    woocommerceConsumerKey: 'ck_test',
    woocommerceConsumerSecret: 'cs_test',
  } as any;

  beforeEach(() => {
    limanService = {
      getProductCount: jest.fn(),
      getProducts: jest.fn(),
    } as any;

    wooClient = {
      getSkuToIdMap: jest.fn(),
      batchUpsertProducts: jest.fn(),
    } as any;

    service = new WoocommerceSyncService(limanService, wooClient);
  });

  describe('syncFullCatalog', () => {
    it('should map products and batch upsert them to WooCommerce', async () => {
      limanService.getProductCount.mockResolvedValue(1);
      limanService.getProducts.mockResolvedValueOnce({
        items: [
          {
            tcod: 251,
            name: 'Burn Energy Drink',
            price: 45.5,
            stock: 12,
            isAvailable: true,
            barcode: '48200000001',
            imageUrls: ['http://localhost:3000/api/v1/media/columb/products/251/1.jpg'],
          },
        ] as any,
        total: 1,
        page: 1,
        limit: 50,
      });

      const mockSkuMap = new Map<string, number>([['251', 1001]]);
      wooClient.getSkuToIdMap.mockResolvedValue(mockSkuMap);
      wooClient.batchUpsertProducts.mockResolvedValue({ created: 0, updated: 1, failed: 0 });

      const onProgress = jest.fn();

      const result = await service.syncFullCatalog(mockTenant, 'http://localhost:3000', {
        onProgress,
      });

      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);
      expect(onProgress).toHaveBeenCalledWith(1, 1);
      expect(wooClient.batchUpsertProducts).toHaveBeenCalledWith(
        mockTenant,
        expect.arrayContaining([
          expect.objectContaining({
            sku: '251',
            name: 'Burn Energy Drink',
            regular_price: '45.5',
            stock_quantity: 12,
            stock_status: 'instock',
          }),
        ]),
        mockSkuMap,
      );
    });
  });

  describe('syncStockAndPrices', () => {
    it('should sync stock and prices in chunks', async () => {
      limanService.getProductCount.mockResolvedValue(1);
      limanService.getProducts.mockResolvedValueOnce({
        items: [
          {
            tcod: 251,
            price: 50.0,
            stock: 8,
            isAvailable: true,
          },
        ] as any,
        total: 1,
        page: 1,
        limit: 50,
      });

      wooClient.getSkuToIdMap.mockResolvedValue(new Map());
      wooClient.batchUpsertProducts.mockResolvedValue({ created: 1, updated: 0, failed: 0 });

      const result = await service.syncStockAndPrices(mockTenant, 'http://localhost:3000');

      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);
      expect(wooClient.batchUpsertProducts).toHaveBeenCalledWith(
        mockTenant,
        expect.arrayContaining([
          expect.objectContaining({
            sku: '251',
            regular_price: '50',
            stock_quantity: 8,
            stock_status: 'instock',
          }),
        ]),
        expect.any(Map),
      );
    });
  });
});
