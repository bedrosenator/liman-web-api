import { WoocommerceController } from './woocommerce.controller';
import { WoocommerceSyncService } from './woocommerce-sync.service';
import { WoocommerceApiClient } from './woocommerce-api.client';
import { WoocommerceImportService } from './woocommerce-import.service';
import { TenantService } from '../tenant/tenant.service';
import { LimanService } from '../liman/liman.service';
import { LimanOrderService } from '../liman/liman-order.service';
import { Queue } from 'bullmq';
import { NotFoundException } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue/queue.constants';

describe('WoocommerceController', () => {
  let controller: WoocommerceController;
  let syncService: jest.Mocked<WoocommerceSyncService>;
  let wooClient: jest.Mocked<WoocommerceApiClient>;
  let importService: jest.Mocked<WoocommerceImportService>;
  let tenantService: jest.Mocked<TenantService>;
  let limanService: jest.Mocked<LimanService>;
  let wooImportQueue: jest.Mocked<Queue>;
  let limanOrderService: jest.Mocked<LimanOrderService>;

  const mockTenant = {
    id: 'columb',
    name: 'Columb Shop',
    woocommerceUrl: 'http://localhost:8080',
    woocommerceOrderWebhookEnabled: true,
    woocommerceCreateOrderDocumentEnabled: false,
  } as any;

  beforeEach(() => {
    syncService = {
      mapWooOrderToUnifiedDto: jest.fn(),
      resolveIntegration: jest.fn(),
      syncOrders: jest.fn(),
    } as any;
    wooClient = {} as any;
    importService = {
      importProductById: jest.fn(),
    } as any;
    tenantService = {
      findOne: jest.fn(),
    } as any;
    limanService = {} as any;
    wooImportQueue = {
      add: jest.fn(),
    } as any;
    limanOrderService = {
      markOrderProcessed: jest.fn(),
      processIncomingOrder: jest.fn(),
    } as any;

    controller = new WoocommerceController(
      syncService,
      wooClient,
      importService,
      tenantService,
      limanService,
      wooImportQueue,
      limanOrderService,
    );
  });

  describe('importCatalog', () => {
    it('should enqueue batch import job into BullMQ and return 202 response with jobId', async () => {
      tenantService.findOne.mockResolvedValueOnce(mockTenant);
      wooImportQueue.add.mockResolvedValueOnce({ id: 'job_woo_99' } as any);

      const response = await controller.importCatalog('columb', '50', '1');

      expect(tenantService.findOne).toHaveBeenCalledWith('columb');
      expect(wooImportQueue.add).toHaveBeenCalledWith(
        'import-woo-catalog-job',
        { tenantId: 'columb', limit: 50, page: 1 },
        expect.any(Object),
      );
      expect(response).toEqual({
        success: true,
        message: 'Задача импорта каталога поставлена в очередь',
        jobId: 'job_woo_99',
        queue: QUEUE_NAMES.IMPORT_WOO_CATALOG,
        tenantId: 'columb',
        statusUrl: '/sync/jobs/import-woo-catalog/job_woo_99',
      });
    });
  });

  describe('handleProductWebhook', () => {
    it('should return 200 with error message when tenant is not found (anti-loop protection for WordPress)', async () => {
      tenantService.findOne.mockRejectedValueOnce(
        new NotFoundException('Tenant not found'),
      );

      const response = await controller.handleProductWebhook('unknown-tenant', {
        product_id: 123,
      });

      expect(response).toEqual({
        success: false,
        tenantId: 'unknown-tenant',
        message: 'Тенант "unknown-tenant" не найден',
      });
      expect(importService.importProductById).not.toHaveBeenCalled();
    });

    it('should return error when product_id is missing', async () => {
      const response = await controller.handleProductWebhook('columb', {});

      expect(response).toEqual({
        success: false,
        message: 'Параметр product_id обязателен',
      });
    });

    it('should import product for valid tenant and payload', async () => {
      tenantService.findOne.mockResolvedValueOnce(mockTenant);
      importService.importProductById.mockResolvedValueOnce({
        success: true,
        productId: 456,
        tcod: 789,
        action: 'created',
      });

      const response = await controller.handleProductWebhook('columb', {
        product_id: 456,
        event: 'created',
      });

      expect(tenantService.findOne).toHaveBeenCalledWith('columb');
      expect(importService.importProductById).toHaveBeenCalledWith(
        mockTenant,
        456,
      );
      expect(response).toEqual({
        tenantId: 'columb',
        success: true,
        productId: 456,
        tcod: 789,
        action: 'created',
      });
    });
  });

  describe('handleOrderWebhook', () => {
    it('should process order through LimanOrderService when webhook enabled', async () => {
      tenantService.findOne.mockResolvedValueOnce(mockTenant);
      limanOrderService.markOrderProcessed.mockReturnValueOnce(true);
      syncService.mapWooOrderToUnifiedDto.mockReturnValueOnce({
        source: 'woocommerce',
        externalOrderId: '12345',
        lineItems: [{ externalArticle: '251', quantity: 2, price: 50 }],
      } as any);
      syncService.resolveIntegration.mockResolvedValueOnce({ id: 'integ-1' } as any);
      limanOrderService.processIncomingOrder.mockResolvedValueOnce({
        success: true,
        externalOrderId: '12345',
        source: 'woocommerce',
        mode: 'deduct_only',
        resolvedItems: [],
        deductedItems: [{ tcod: 251, qty: 2, oldStock: 10, newStock: 8 }],
        skippedArticles: [],
        warnings: [],
      });

      const payload = {
        id: 12345,
        line_items: [{ sku: '251', quantity: 2, price: '50' }],
      };

      const result = await controller.handleOrderWebhook('columb', payload);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(12345);
      expect(result.source).toBe('woocommerce');
      expect(result.processedItems).toEqual([
        { tcod: 251, requestedQty: 2, oldStock: 10, newStock: 8 },
      ]);
      expect(limanOrderService.processIncomingOrder).toHaveBeenCalledWith(
        mockTenant,
        expect.any(Object),
        'integ-1',
      );
    });

    it('should skip order when woocommerceOrderWebhookEnabled is false', async () => {
      tenantService.findOne.mockResolvedValueOnce({
        ...mockTenant,
        woocommerceOrderWebhookEnabled: false,
      });

      const payload = { id: 12345 };
      const result = await controller.handleOrderWebhook('columb', payload);

      expect(result.success).toBe(false);
      expect(result.disabled).toBe(true);
      expect(limanOrderService.processIncomingOrder).not.toHaveBeenCalled();
    });

    it('should skip duplicate order when already processed', async () => {
      tenantService.findOne.mockResolvedValueOnce(mockTenant);
      limanOrderService.markOrderProcessed.mockReturnValueOnce(false);

      const payload = { id: 12345 };
      const result = await controller.handleOrderWebhook('columb', payload);

      expect(result.success).toBe(true);
      expect(result.message).toContain('уже был обработан');
      expect(limanOrderService.processIncomingOrder).not.toHaveBeenCalled();
    });
  });

  describe('syncOrders', () => {
    it('should call syncService.syncOrders with options and return result', async () => {
      tenantService.findOne.mockResolvedValueOnce(mockTenant);
      syncService.syncOrders.mockResolvedValueOnce({
        totalFetched: 2,
        processedOrders: 2,
        skippedOrders: 0,
        itemsDeducted: [{ orderId: '501', tcod: 251, qty: 1, oldStock: 5, newStock: 4 }],
      });

      const result = await controller.syncOrders('columb', 'processing', '20');

      expect(tenantService.findOne).toHaveBeenCalledWith('columb');
      expect(syncService.syncOrders).toHaveBeenCalledWith(mockTenant, {
        status: 'processing',
        perPage: 20,
      });
      expect(result.success).toBe(true);
      expect(result.processedOrders).toBe(2);
      expect(result.itemsDeducted.length).toBe(1);
    });
  });
});
