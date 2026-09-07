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
    } as any;

    rozetkaClient = {
      updateStocks: jest.fn(),
      updatePrices: jest.fn(),
    } as any;

    service = new RozetkaSyncService(limanService, rozetkaClient);
  });

  it('should return 0 when catalog is empty', async () => {
    limanService.getProductCount.mockResolvedValue(0);
    limanService.getProducts.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 });

    const result = await service.syncPricesAndStocks(mockTenant, 'http://localhost:3000');
    expect(result.stocksSynced).toBe(0);
    expect(result.pricesSynced).toBe(0);
    expect(result.errors).toBe(0);
    expect(rozetkaClient.updateStocks).not.toHaveBeenCalled();
    expect(rozetkaClient.updatePrices).not.toHaveBeenCalled();
  });

  it('should batch sync stock and prices successfully', async () => {
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

    rozetkaClient.updateStocks.mockResolvedValue({ success: true, updated: 2 });
    rozetkaClient.updatePrices.mockResolvedValue({ success: true, updated: 2 });

    const result = await service.syncPricesAndStocks(mockTenant, 'http://localhost:3000');

    expect(result.stocksSynced).toBe(2);
    expect(result.pricesSynced).toBe(2);
    expect(result.errors).toBe(0);
    expect(rozetkaClient.updateStocks).toHaveBeenCalledWith(
      mockTenant,
      [
        { item_id: 101, stock: 10 },
        { item_id: 102, stock: 0 },
      ],
    );
    expect(rozetkaClient.updatePrices).toHaveBeenCalledWith(
      mockTenant,
      [
        { id: 101, price: 150.5 },
        { id: 102, price: 200 },
      ],
    );
  });

  it('should count errors gracefully when API client fails', async () => {
    limanService.getProductCount.mockResolvedValue(1);
    limanService.getProducts.mockResolvedValueOnce({
      items: [{ tcod: 101, name: 'Product 1', price: 100, stock: 5, isAvailable: true }] as any,
      total: 1,
      page: 1,
      limit: 100,
    });

    rozetkaClient.updateStocks.mockRejectedValue(new Error('Network error'));
    rozetkaClient.updatePrices.mockResolvedValue({ success: true, updated: 1 });

    const result = await service.syncPricesAndStocks(mockTenant, 'http://localhost:3000');

    expect(result.stocksSynced).toBe(0);
    expect(result.pricesSynced).toBe(1);
    expect(result.errors).toBe(1); // 1 stock item failed
  });
});
