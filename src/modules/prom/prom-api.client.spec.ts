import { Test, TestingModule } from '@nestjs/testing';
import { PromApiClient } from './prom-api.client';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PromApiClient', () => {
  let client: PromApiClient;
  const mockToken = 'test-prom-token-12345';
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PromApiClient],
    }).compile();

    client = module.get<PromApiClient>(PromApiClient);
  });

  describe('ping', () => {
    it('should throw error if token is empty', async () => {
      await expect(client.ping('')).rejects.toThrow('Prom API Token не задан');
    });

    it('should return connection info and company title on successful ping', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: { products: [{ id: 1, name: 'Prod 1' }] },
        })
        .mockResolvedValueOnce({ data: { orders: [] } })
        .mockResolvedValueOnce({ data: { name: 'My Prom Shop' } });

      const result = await client.ping(mockToken);
      expect(result.success).toBe(true);
      expect(result.productsCount).toBe(1);
      expect(result.ordersCount).toBe(0);
      expect(result.shopTitle).toBe('My Prom Shop');
    });
  });

  describe('getGroups', () => {
    it('should fetch categories tree from /groups/list', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          groups: [
            { id: 10, name: 'Electronics', parent_group_id: null },
            { id: 11, name: 'Smartphones', parent_group_id: 10 },
          ],
        },
      });

      const groups = await client.getGroups(mockToken);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/groups/list', {
        params: undefined,
      });
      expect(groups).toHaveLength(2);
      expect(groups[1].name).toBe('Smartphones');
    });

    it('should throw error if token missing', async () => {
      await expect(client.getGroups('')).rejects.toThrow('Prom API Token не задан');
    });
  });

  describe('getProducts', () => {
    it('should fetch products list with params', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          products: [
            { id: 101, name: 'Product 1', price: 100 },
            { id: 102, name: 'Product 2', price: 200 },
          ],
        },
      });

      const products = await client.getProducts(mockToken, { limit: 50, last_id: 100 });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/products/list', {
        params: { limit: 50, last_id: 100 },
      });
      expect(products).toHaveLength(2);
    });
  });

  describe('getProductById and getProductByExternalId', () => {
    it('should get product by Prom ID', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { product: { id: 101, name: 'Product 1' } },
      });

      const prod = await client.getProductById(mockToken, 101);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/products/101');
      expect(prod?.id).toBe(101);
    });

    it('should get product by external ID', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { product: { id: 101, external_id: 'tcod-251' } },
      });

      const prod = await client.getProductByExternalId(mockToken, 'tcod-251');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/products/by_external_id/tcod-251');
      expect(prod?.external_id).toBe('tcod-251');
    });
  });

  describe('editPricesAndStock', () => {
    it('should map external_id to id field for Prom API', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { processed_ids: ['101', '102'] },
      });

      const result = await client.editPricesAndStock(mockToken, [
        {
          external_id: '101',
          price: 150,
          presence: 'available',
          quantity_in_stock: 5,
        },
        {
          id: '102',
          price: 200,
          presence: 'not_available',
          quantity_in_stock: 0,
        },
      ]);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/products/edit_by_external_id',
        [
          {
            id: '101',
            price: 150,
            presence: 'available',
            quantity_in_stock: 5,
          },
          {
            id: '102',
            price: 200,
            presence: 'not_available',
            quantity_in_stock: 0,
          },
        ],
      );
      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
    });
  });

  describe('editProductsById and editProducts', () => {
    it('should send direct edits by Prom ID', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { processed_ids: [3195399849] },
      });

      const result = await client.editProductsById(mockToken, [
        { id: 3195399849, price: 170, quantity_in_stock: 250 },
      ]);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/products/edit', [
        { id: 3195399849, price: 170, quantity_in_stock: 250 },
      ]);
      expect(result.processedIds).toEqual([3195399849]);
    });

    it('should batch edit catalog products', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { processed_ids: [1, 2] },
      });

      const result = await client.editProducts(mockToken, [
        { name: 'Item 1', price: 100 },
        { name: 'Item 2', price: 200 },
      ]);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
    });
  });

  describe('importUrl and getImportStatus', () => {
    it('should post import URL request', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { id: 'import_job_123', message: 'Import started' },
      });

      const res = await client.importUrl(mockToken, {
        url: 'https://example.com/feed.xml',
        force_update: true,
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/products/import_url', {
        url: 'https://example.com/feed.xml',
        force_update: true,
        only_available: false,
        only_update: false,
        mark_missing_product_as: 'none',
        updated_fields: ['price', 'presence', 'quantity_in_stock'],
      });
      expect(res.success).toBe(true);
      expect(res.id).toBe('import_job_123');
    });

    it('should get import status by ID', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { id: 'import_job_123', status: 'completed', processed_items: 50 },
      });

      const status = await client.getImportStatus(mockToken, 'import_job_123');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/products/import/status/import_job_123');
      expect(status.status).toBe('completed');
    });
  });

  describe('getOrders, getOrder and setOrderStatus', () => {
    it('should fetch orders list with params', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { orders: [{ id: 999, status: 'pending' }] },
      });

      const orders = await client.getOrders(mockToken, { status: 'pending' });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/orders/list', {
        params: { status: 'pending' },
      });
      expect(orders).toHaveLength(1);
    });

    it('should fetch single order by ID', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { order: { id: 999, status: 'received' } },
      });

      const order = await client.getOrder(mockToken, 999);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/orders/999');
      expect(order?.id).toBe(999);
    });

    it('should set order status', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

      const res = await client.setOrderStatus(mockToken, 999, 'paid');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/orders/set_status', {
        status: 'paid',
        ids: [999],
      });
      expect(res.success).toBe(true);
    });
  });
});
