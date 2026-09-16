import { WoocommerceImportService } from './woocommerce-import.service';
import { LimanService } from '../liman/liman.service';
import { WoocommerceApiClient, WooProduct } from './woocommerce-api.client';
import { Tenant } from '../tenant/tenant.entity';

describe('WoocommerceImportService', () => {
  let service: WoocommerceImportService;
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
      upsertProductFromExternal: jest.fn(),
      findProductBySkuOrBarcode: jest.fn(),
    } as any;

    wooClient = {
      getProductById: jest.fn(),
      getProducts: jest.fn(),
      updateProductById: jest.fn(),
    } as any;

    service = new WoocommerceImportService(limanService, wooClient);
  });

  describe('importProduct', () => {
    it('should import existing product with numeric SKU and not update SKU in Woo if already matches', async () => {
      const wooProduct: WooProduct = {
        id: 101,
        sku: '251',
        name: 'Existing Product',
        regular_price: '49.99',
        manage_stock: true,
        stock_quantity: 15,
        categories: [{ name: 'Drinks' }],
      };

      limanService.upsertProductFromExternal.mockResolvedValueOnce({
        tcod: 251,
        action: 'updated',
      });

      const result = await service.importProduct(mockTenant, wooProduct);

      expect(result.success).toBe(true);
      expect(result.tcod).toBe(251);
      expect(result.action).toBe('updated');
      expect(limanService.upsertProductFromExternal).toHaveBeenCalledWith(
        mockTenant,
        expect.objectContaining({
          sku: '251',
          name: 'Existing Product',
          price: 49.99,
          stock: 15,
          categoryName: 'Drinks',
        }),
      );
      // SKU matches 251, so updateProductById should not be called
      expect(wooClient.updateProductById).not.toHaveBeenCalled();
    });

    it('should import new product without SKU and update SKU in WooCommerce to generated tcod', async () => {
      const wooProduct: WooProduct = {
        id: 555,
        sku: '',
        name: 'Brand New Product',
        regular_price: '120.00',
        manage_stock: true,
        stock_quantity: 5,
        categories: [{ name: 'Snacks' }],
        meta_data: [{ key: '_barcode', value: '4820123456789' }],
      };

      limanService.upsertProductFromExternal.mockResolvedValueOnce({
        tcod: 7711,
        action: 'created',
      });
      wooClient.updateProductById.mockResolvedValueOnce({});

      const result = await service.importProduct(mockTenant, wooProduct);

      expect(result.success).toBe(true);
      expect(result.tcod).toBe(7711);
      expect(result.action).toBe('created');
      expect(result.skuUpdatedInWoo).toBe(true);

      expect(limanService.upsertProductFromExternal).toHaveBeenCalledWith(
        mockTenant,
        expect.objectContaining({
          name: 'Brand New Product',
          barcode: '4820123456789',
          price: 120,
          stock: 5,
          categoryName: 'Snacks',
        }),
      );

      // Verify Two-Way Sync closure: WooCommerce product SKU set to generated tcod
      expect(wooClient.updateProductById).toHaveBeenCalledWith(
        mockTenant,
        555,
        {
          sku: '7711',
        },
      );
    });
  });

  describe('importProductById', () => {
    it('should return error if product not found in WooCommerce', async () => {
      wooClient.getProductById.mockResolvedValueOnce(null);

      const result = await service.importProductById(mockTenant, 9999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('не найден в WooCommerce');
      expect(limanService.upsertProductFromExternal).not.toHaveBeenCalled();
    });

    it('should fetch and import product by ID', async () => {
      const wooProduct: WooProduct = {
        id: 202,
        sku: '251',
        name: 'Test Item',
        regular_price: '50',
      };
      wooClient.getProductById.mockResolvedValueOnce(wooProduct);
      limanService.upsertProductFromExternal.mockResolvedValueOnce({
        tcod: 251,
        action: 'updated',
      });

      const result = await service.importProductById(mockTenant, 202);

      expect(result.success).toBe(true);
      expect(result.productId).toBe(202);
      expect(result.tcod).toBe(251);
    });
  });

  describe('importAllProducts', () => {
    it('should process pages of products from WooCommerce', async () => {
      const page1: WooProduct[] = [
        { id: 1, sku: '10', name: 'Item 1', regular_price: '10' },
        { id: 2, sku: '20', name: 'Item 2', regular_price: '20' },
      ];

      wooClient.getProducts
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce([]); // end of products

      limanService.upsertProductFromExternal
        .mockResolvedValueOnce({ tcod: 10, action: 'updated' })
        .mockResolvedValueOnce({ tcod: 20, action: 'created' });

      const onProgress = jest.fn();
      const result = await service.importAllProducts(mockTenant, {
        limit: 10,
        onProgress,
      });

      expect(result.totalProcessed).toBe(2);
      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.itemsTruncated).toBe(false);
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it('should ignore _sku in meta_data when extracting barcode and prefer real barcode fields', async () => {
      const wooProduct: WooProduct = {
        id: 999,
        sku: 'MY-SKU-123',
        name: 'Product with meta _sku',
        regular_price: '10',
        meta_data: [
          { key: '_sku', value: 'MY-SKU-123' },
          { key: '_barcode', value: '5901234567890' },
        ],
      };

      limanService.upsertProductFromExternal.mockResolvedValueOnce({
        tcod: 999,
        action: 'updated',
      });

      await service.importProduct(mockTenant, wooProduct);

      expect(limanService.upsertProductFromExternal).toHaveBeenCalledWith(
        mockTenant,
        expect.objectContaining({
          barcode: '5901234567890',
        }),
      );
    });
  });
});
