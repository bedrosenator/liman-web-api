import { LimanOrderService } from './liman-order.service';
import { LimanService } from './liman.service';
import { TenantConnectionManager } from './tenant-connection-manager.service';
import { ProductMappingService } from '../tenant/product-mapping.service';
import { Tenant } from '../tenant/tenant.entity';
import { UnifiedIncomingOrderDto } from './dto/unified-order.dto';

describe('LimanOrderService', () => {
  let service: LimanOrderService;
  let limanService: jest.Mocked<LimanService>;
  let connectionManager: jest.Mocked<TenantConnectionManager>;
  let productMappingService: jest.Mocked<ProductMappingService>;

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
    woocommerceImportEnabled: false,
    woocommerceSyncIntervalMinutes: 15,
    rozetkaExportEnabled: false,
    horoshopExportEnabled: false,
    horoshopOrderWebhookEnabled: true,
    horoshopProductCreationWebhookEnabled: false,
    horoshopCreateOrderDocumentEnabled: false, // Режим 1 по умолчанию
    horoshopSyncIntervalMinutes: 15,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Tenant;

  beforeEach(() => {
    limanService = {
      deductStock: jest.fn(),
      findProductBySkuOrBarcode: jest.fn(),
    } as any;

    connectionManager = {
      getPool: jest.fn(),
    } as any;

    productMappingService = {
      getMappingByExternalArticle: jest.fn(),
    } as any;

    service = new LimanOrderService(
      limanService,
      connectionManager,
      productMappingService,
    );
  });

  describe('markOrderProcessed', () => {
    it('should return true for new order and false for duplicate', () => {
      expect(service.markOrderProcessed('columb', 'horoshop', '10421')).toBe(true);
      expect(service.markOrderProcessed('columb', 'horoshop', '10421')).toBe(false);
    });

    it('should treat different sources as different orders', () => {
      expect(service.markOrderProcessed('columb', 'horoshop', '10421')).toBe(true);
      expect(service.markOrderProcessed('columb', 'woocommerce', '10421')).toBe(true);
    });
  });

  describe('resolveProductTcod', () => {
    it('should resolve string article ELE-23-0557 via product_mappings (Level 1)', async () => {
      productMappingService.getMappingByExternalArticle.mockResolvedValue({
        limanTcod: 7742,
        externalArticle: 'ELE-23-0557',
      } as any);

      const result = await service.resolveProductTcod(
        mockTenant,
        'integ-uuid-1',
        'ELE-23-0557',
      );

      expect(result.tcod).toBe(7742);
      expect(result.resolvedVia).toBe('product_mappings');
      expect(productMappingService.getMappingByExternalArticle).toHaveBeenCalledWith(
        'integ-uuid-1',
        'ELE-23-0557',
      );
    });

    it('should resolve numeric tcod string "251" via LimanService (Level 2)', async () => {
      productMappingService.getMappingByExternalArticle.mockResolvedValue(null);
      limanService.findProductBySkuOrBarcode.mockResolvedValue({ tcod: 251 });

      const result = await service.resolveProductTcod(mockTenant, 'integ-1', '251');

      expect(result.tcod).toBe(251);
      expect(result.resolvedVia).toBe('tcod_direct');
    });

    it('should return null when article not found in any level (Level 3)', async () => {
      productMappingService.getMappingByExternalArticle.mockResolvedValue(null);
      limanService.findProductBySkuOrBarcode.mockResolvedValue(null);

      const result = await service.resolveProductTcod(
        mockTenant,
        'integ-1',
        'UNKNOWN-SKU-9999',
      );

      expect(result.tcod).toBeNull();
      expect(result.resolvedVia).toBe('not_found');
    });

    it('should return null for empty article', async () => {
      const result = await service.resolveProductTcod(mockTenant, null, '');
      expect(result.tcod).toBeNull();
    });

    it('should skip product_mappings when integrationId is null', async () => {
      limanService.findProductBySkuOrBarcode.mockResolvedValue({ tcod: 251 });

      const result = await service.resolveProductTcod(mockTenant, null, '251');

      expect(productMappingService.getMappingByExternalArticle).not.toHaveBeenCalled();
      expect(result.tcod).toBe(251);
    });
  });

  describe('processIncomingOrder — Режим 1 (deduct_only)', () => {
    const makeDto = (overrides: Partial<UnifiedIncomingOrderDto> = {}): UnifiedIncomingOrderDto => ({
      source: 'horoshop',
      externalOrderId: '10421',
      lineItems: [
        { externalArticle: 'ELE-23-0557', name: 'iPhone 13 Pro Max', quantity: 1, price: 42999 },
      ],
      ...overrides,
    });

    it('should deduct stock via deductStock for found articles (Mode 1)', async () => {
      productMappingService.getMappingByExternalArticle.mockResolvedValue({
        limanTcod: 7742,
        externalArticle: 'ELE-23-0557',
      } as any);
      limanService.deductStock.mockResolvedValue({
        success: true,
        tcod: 7742,
        oldStock: 10,
        newStock: 9,
        deducted: 1,
      });

      const result = await service.processIncomingOrder(
        mockTenant,
        makeDto(),
        'integ-uuid-1',
        { createDocument: false },
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('deduct_only');
      expect(result.deductedItems).toHaveLength(1);
      expect(result.deductedItems[0]).toEqual(
        expect.objectContaining({ tcod: 7742, qty: 1, oldStock: 10, newStock: 9 }),
      );
      expect(limanService.deductStock).toHaveBeenCalledWith(mockTenant, 7742, 1);
    });

    it('should skip article not found and add warning (no transaction abort)', async () => {
      productMappingService.getMappingByExternalArticle.mockResolvedValue(null);
      limanService.findProductBySkuOrBarcode.mockResolvedValue(null);

      const result = await service.processIncomingOrder(
        mockTenant,
        makeDto(),
        'integ-uuid-1',
      );

      expect(result.success).toBe(true); // Транзакция не прерывается
      expect(result.deductedItems).toHaveLength(0);
      expect(result.skippedArticles).toContain('ELE-23-0557');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('ELE-23-0557');
      expect(limanService.deductStock).not.toHaveBeenCalled();
    });

    it('should use tenant.horoshopCreateOrderDocumentEnabled flag by default for horoshop', async () => {
      productMappingService.getMappingByExternalArticle.mockResolvedValue({
        limanTcod: 251,
        externalArticle: '251',
      } as any);
      limanService.deductStock.mockResolvedValue({
        success: true, tcod: 251, oldStock: 5, newStock: 4, deducted: 1,
      });

      // Tenant with flag = false (default)
      const result = await service.processIncomingOrder(mockTenant, makeDto({
        source: 'horoshop',
        lineItems: [{ externalArticle: '251', quantity: 1, price: 100 }],
      }), 'integ-1');

      expect(result.mode).toBe('deduct_only');
    });

    it('should use tenant.promCreateOrderDocumentEnabled flag for prom source', async () => {
      productMappingService.getMappingByExternalArticle.mockResolvedValue({
        limanTcod: 251,
        externalArticle: '251',
      } as any);
      limanService.deductStock.mockResolvedValue({
        success: true, tcod: 251, oldStock: 5, newStock: 4, deducted: 1,
      });

      const promTenant = {
        ...mockTenant,
        promCreateOrderDocumentEnabled: false,
      } as any;

      const result = await service.processIncomingOrder(promTenant, makeDto({
        source: 'prom',
        lineItems: [{ externalArticle: '251', quantity: 1, price: 100 }],
      }), 'integ-prom-1');

      expect(result.mode).toBe('deduct_only');
      expect(result.source).toBe('prom');
    });

    it('should prioritize opts.createDocument override when specified', async () => {
      productMappingService.getMappingByExternalArticle.mockResolvedValue({
        limanTcod: 251,
        externalArticle: '251',
      } as any);
      limanService.deductStock.mockResolvedValue({
        success: true, tcod: 251, oldStock: 5, newStock: 4, deducted: 1,
      });

      const result = await service.processIncomingOrder(
        mockTenant,
        makeDto({
          source: 'prom',
          lineItems: [{ externalArticle: '251', quantity: 1, price: 100 }],
        }),
        'integ-prom-1',
        { createDocument: false },
      );

      expect(result.mode).toBe('deduct_only');
    });

    it('should process multiple line items correctly', async () => {
      productMappingService.getMappingByExternalArticle
        .mockResolvedValueOnce({ limanTcod: 7742 } as any)
        .mockResolvedValueOnce({ limanTcod: 251 } as any);
      limanService.deductStock
        .mockResolvedValueOnce({ success: true, tcod: 7742, oldStock: 5, newStock: 4, deducted: 1 })
        .mockResolvedValueOnce({ success: true, tcod: 251, oldStock: 10, newStock: 8, deducted: 2 });

      const result = await service.processIncomingOrder(
        mockTenant,
        makeDto({
          lineItems: [
            { externalArticle: 'ELE-23-0557', quantity: 1, price: 42999 },
            { externalArticle: '251', quantity: 2, price: 47 },
          ],
        }),
        'integ-uuid-1',
      );

      expect(result.deductedItems).toHaveLength(2);
      expect(limanService.deductStock).toHaveBeenCalledTimes(2);
    });
  });
});
