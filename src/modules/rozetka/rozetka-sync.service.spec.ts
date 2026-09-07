import { RozetkaSyncService } from './rozetka-sync.service';
import { LimanService } from '../liman/liman.service';
import { RozetkaApiClient } from './rozetka-api.client';
import { Tenant } from '../tenant/tenant.entity';

describe('RozetkaSyncService', () => {
  let service: RozetkaSyncService;
  let limanService: jest.Mocked<LimanService>;
  let rozetkaClient: jest.Mocked<RozetkaApiClient>;

  const mockTenant = {
    id: 'columb',
    name: 'Columb Shop',
  } as Tenant;

  beforeEach(() => {
    limanService = {
      getProductCount: jest.fn(),
      getProducts: jest.fn(),
      deductStock: jest.fn(),
    } as any;

    rozetkaClient = {
      massUpdateItems: jest.fn(),
      searchOrders: jest.fn(),
      getOrderDetails: jest.fn(),
    } as any;

    service = new RozetkaSyncService(limanService, rozetkaClient);
  });

  describe('syncPricesAndStocks', () => {
    it('should return 0 when catalog is empty', async () => {
      limanService.getProductCount.mockResolvedValue(0);
      limanService.getProducts.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 });

      const result = await service.syncPricesAndStocks(mockTenant, 'http://localhost:3000');
      expect(result.itemsSynced).toBe(0);
      expect(result.errors).toBe(0);
      expect(rozetkaClient.massUpdateItems).not.toHaveBeenCalled();
    });

    it('should batch mass-update stock and prices in a single call', async () => {
      limanService.getProductCount.mockResolvedValue(2);
      limanService.getProducts.mockResolvedValueOnce({
        items: [
          { tcod: 101, name: 'Product 1', price: 150.5, stock: 10, isAvailable: true },
          { tcod: 102, name: 'Product 2', price: 200, stock: 0, isAvailable: false },
        ] as any,
        total: 2,
        page: 1,
        limit: 100,
      });

      rozetkaClient.massUpdateItems.mockResolvedValue({
        success: true,
        updated: 2,
        errorsCount: 0,
      });

      const result = await service.syncPricesAndStocks(mockTenant, 'http://localhost:3000');

      expect(result.itemsSynced).toBe(2);
      expect(result.errors).toBe(0);
      expect(rozetkaClient.massUpdateItems).toHaveBeenCalledWith(mockTenant, {
        isIgnoreCheck: false,
        items: [
          { item_id: 101, price: 150.5, stock_quantity: 10 },
          { item_id: 102, price: 200, stock_quantity: 0 },
        ],
      });
    });

    it('should count errors gracefully when API client fails', async () => {
      limanService.getProductCount.mockResolvedValue(1);
      limanService.getProducts.mockResolvedValueOnce({
        items: [{ tcod: 101, name: 'Product 1', price: 100, stock: 5, isAvailable: true }] as any,
        total: 1,
        page: 1,
        limit: 100,
      });

      rozetkaClient.massUpdateItems.mockRejectedValue(new Error('Network error'));

      const result = await service.syncPricesAndStocks(mockTenant, 'http://localhost:3000');

      expect(result.itemsSynced).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe('syncOrders', () => {
    it('should return empty stats if no new orders found', async () => {
      rozetkaClient.searchOrders.mockResolvedValue([]);

      const result = await service.syncOrders(mockTenant);
      expect(result.ordersProcessed).toBe(0);
      expect(result.itemsDeducted).toBe(0);
      expect(result.errors).toBe(0);
      expect(rozetkaClient.getOrderDetails).not.toHaveBeenCalled();
    });

    it('should process new orders and deduct stock in Limansoft', async () => {
      rozetkaClient.searchOrders.mockResolvedValue([
        { id: 987654, status: 1, status_group: 1, amount: '300.00', cost: '300.00', created: '2026-09-07' },
      ]);

      rozetkaClient.getOrderDetails.mockResolvedValue({
        id: 987654,
        status: 1,
        status_group: 1,
        amount: '300.00',
        cost: '300.00',
        created: '2026-09-07',
        purchases: [
          {
            id: 1,
            item_id: 101,
            item_name: 'Product 1',
            quantity: 2,
            price: 150,
            cost: 300,
            item: { id: 101, price_offer_id: '101' },
          },
        ],
      });

      limanService.deductStock.mockResolvedValue({
        tcod: 101,
        deducted: 2,
        oldStock: 10,
        newStock: 8,
      });

      const result = await service.syncOrders(mockTenant);

      expect(result.ordersProcessed).toBe(1);
      expect(result.itemsDeducted).toBe(2);
      expect(result.errors).toBe(0);
      expect(limanService.deductStock).toHaveBeenCalledWith(mockTenant, 101, 2);
    });
  });
});
