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

    it('should return connection info on successful ping', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: { products: [{ id: 1, name: 'Prod 1' }] },
        })
        .mockResolvedValueOnce({ data: { orders: [] } });

      const result = await client.ping(mockToken);
      expect(result.success).toBe(true);
      expect(result.productsCount).toBe(1);
      expect(result.ordersCount).toBe(0);
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

  describe('editProductsById', () => {
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
  });

  describe('getOrders', () => {
    it('should fetch orders list', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { orders: [{ id: 999, status: 'pending' }] },
      });

      const orders = await client.getOrders(mockToken, 'pending');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/orders/list', {
        params: { status: 'pending' },
      });
      expect(orders).toHaveLength(1);
    });
  });
});
