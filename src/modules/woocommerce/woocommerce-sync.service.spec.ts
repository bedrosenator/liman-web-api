import { WoocommerceSyncService } from './woocommerce-sync.service';
import { LimanService } from '../liman/liman.service';
import { LimanOrderService } from '../liman/liman-order.service';
import { WoocommerceApiClient } from './woocommerce-api.client';
import { Tenant } from '../tenant/tenant.entity';

describe('WoocommerceSyncService', () => {
  let service: WoocommerceSyncService;
  let limanService: jest.Mocked<LimanService>;
  let wooClient: jest.Mocked<WoocommerceApiClient>;
  let limanOrderService: jest.Mocked<LimanOrderService>;
  let productMappingService: any;

  const mockTenant: Tenant = {
    id: 'columb',
    name: 'Columb Shop',
    woocommerceUrl: 'http://localhost:8080',
    woocommerceConsumerKey: 'ck_test',
    woocommerceConsumerSecret: 'cs_test',
    woocommerceOrderWebhookEnabled: true,
    woocommerceCreateOrderDocumentEnabled: false,
  } as any;

  beforeEach(() => {
    limanService = {
      getProductCount: jest.fn(),
      getProducts: jest.fn(),
    } as any;

    wooClient = {
      getSkuToIdMap: jest.fn(),
      batchUpsertProducts: jest.fn(),
      getOrders: jest.fn(),
    } as any;

    limanOrderService = {
      markOrderProcessed: jest.fn(),
      processIncomingOrder: jest.fn(),
    } as any;

    productMappingService = {
      resolveActiveIntegration: jest.fn().mockResolvedValue({ id: 'woo-integ-1' }),
    };

    service = new WoocommerceSyncService(
      limanService,
      wooClient,
      undefined,
      limanOrderService,
      productMappingService,
    );
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
            imageUrls: [
              'http://localhost:3000/api/v1/media/columb/products/251/1.jpg',
            ],
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      });

      const mockSkuMap = new Map<string, number>([['251', 1001]]);
      wooClient.getSkuToIdMap.mockResolvedValue(mockSkuMap);
      wooClient.batchUpsertProducts.mockResolvedValue({
        update: [{ id: 1001 }] as any,
      });

      const onProgress = jest.fn();

      const result = await service.syncFullCatalog(
        mockTenant,
        'http://localhost:3000',
        {
          onProgress,
        },
      );

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
      wooClient.batchUpsertProducts.mockResolvedValue({
        create: [{ id: 1002 }] as any,
      });

      const result = await service.syncStockAndPrices(
        mockTenant,
        'http://localhost:3000',
      );

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

  describe('mapWooOrderToUnifiedDto', () => {
    it('should correctly map raw WooCommerce order to UnifiedIncomingOrderDto', () => {
      const rawOrder = {
        id: 991,
        billing: {
          first_name: 'Іван',
          last_name: 'Франко',
          phone: '+380501234567',
        },
        shipping: {
          address_1: 'вул. Шевченка, 10',
          address_2: 'Відділення 12',
          city: 'Львів',
        },
        shipping_lines: [{ method_title: 'Нова Пошта (відділення)' }],
        payment_method_title: 'Оплата картою LiqPay',
        total: '1500.00',
        currency: 'UAH',
        line_items: [
          {
            sku: 'ELE-23-0557',
            name: 'Powerbank 20000mAh',
            quantity: 2,
            price: '750',
          },
        ],
      };

      const dto = service.mapWooOrderToUnifiedDto(rawOrder);

      expect(dto.source).toBe('woocommerce');
      expect(dto.externalOrderId).toBe('991');
      expect(dto.customerName).toBe('Іван Франко');
      expect(dto.customerPhone).toBe('+380501234567');
      expect(dto.deliveryService).toBe('nova_poshta');
      expect(dto.deliveryWarehouse).toBe('Відділення 12');
      expect(dto.totalAmount).toBe(1500);
      expect(dto.lineItems).toEqual([
        {
          externalArticle: 'ELE-23-0557',
          name: 'Powerbank 20000mAh',
          quantity: 2,
          price: 750,
          discount: undefined,
        },
      ]);
    });
  });

  describe('syncOrders', () => {
    it('should poll orders, deduplicate and process new orders through LimanOrderService', async () => {
      const rawOrders = [
        {
          id: 501,
          line_items: [{ sku: '251', quantity: 1, price: '45' }],
        },
      ];

      wooClient.getOrders.mockResolvedValueOnce(rawOrders as any);
      limanOrderService.markOrderProcessed.mockReturnValueOnce(true);
      limanOrderService.processIncomingOrder.mockResolvedValueOnce({
        success: true,
        externalOrderId: '501',
        source: 'woocommerce',
        mode: 'deduct_only',
        resolvedItems: [],
        deductedItems: [{ tcod: 251, qty: 1, oldStock: 10, newStock: 9 }],
        skippedArticles: [],
        warnings: [],
      });

      const result = await service.syncOrders(mockTenant, { status: 'processing' });

      expect(wooClient.getOrders).toHaveBeenCalledWith(mockTenant, 'processing', 50);
      expect(limanOrderService.markOrderProcessed).toHaveBeenCalledWith(
        'columb',
        'woocommerce',
        '501',
      );
      expect(limanOrderService.processIncomingOrder).toHaveBeenCalledWith(
        mockTenant,
        expect.any(Object),
        'woo-integ-1',
      );
      expect(result.totalFetched).toBe(1);
      expect(result.processedOrders).toBe(1);
      expect(result.skippedOrders).toBe(0);
      expect(result.itemsDeducted).toEqual([
        { orderId: '501', tcod: 251, qty: 1, oldStock: 10, newStock: 9 },
      ]);
    });

    it('should skip duplicate orders during polling', async () => {
      const rawOrders = [
        {
          id: 501,
          line_items: [{ sku: '251', quantity: 1 }],
        },
      ];

      wooClient.getOrders.mockResolvedValueOnce(rawOrders as any);
      limanOrderService.markOrderProcessed.mockReturnValueOnce(false);

      const result = await service.syncOrders(mockTenant);

      expect(result.totalFetched).toBe(1);
      expect(result.processedOrders).toBe(0);
      expect(result.skippedOrders).toBe(1);
      expect(limanOrderService.processIncomingOrder).not.toHaveBeenCalled();
    });
  });
});
