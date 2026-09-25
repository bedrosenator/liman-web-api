import { Test, TestingModule } from '@nestjs/testing';
import { PromExportProcessor } from './prom-export.processor';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { PromApiClient } from './prom-api.client';
import { PromSyncService } from './prom-sync.service';
import { ProductMappingService } from '../tenant/product-mapping.service';

describe('PromExportProcessor', () => {
  let processor: PromExportProcessor;
  let limanService: jest.Mocked<LimanService>;
  let tenantService: jest.Mocked<TenantService>;
  let promClient: jest.Mocked<PromApiClient>;
  let promSyncService: jest.Mocked<PromSyncService>;
  let productMappingService: any;

  beforeEach(async () => {
    limanService = {
      getCategories: jest.fn().mockResolvedValue([
        { group: 'grp-1', name: 'Smartphones', parent: null },
      ]),
      getProducts: jest.fn(),
    } as any;

    tenantService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'columb',
        promApiKey: 'test-prom-key',
        publicBaseUrl: 'https://liman.example.com',
      }),
    } as any;

    promClient = {
      getGroups: jest.fn().mockResolvedValue([
        { id: 456, name: 'Smartphones', parent_group_id: null },
      ]),
      editProductsByExternalId: jest.fn().mockResolvedValue({
        success: true,
        processed: 2,
        processedIds: ['101', '102'],
      }),
      importUrl: jest.fn().mockResolvedValue({ success: true }),
    } as any;

    promSyncService = {
      resolveIntegration: jest.fn().mockResolvedValue({ id: 'integ-prom-1' }),
      addActivity: jest.fn(),
    } as any;

    productMappingService = {
      getAllMappedTcods: jest.fn().mockResolvedValue(new Set([101])),
      saveBatchMappings: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromExportProcessor,
        { provide: LimanService, useValue: limanService },
        { provide: TenantService, useValue: tenantService },
        { provide: PromApiClient, useValue: promClient },
        { provide: PromSyncService, useValue: promSyncService },
        { provide: ProductMappingService, useValue: productMappingService },
      ],
    }).compile();

    processor = module.get<PromExportProcessor>(PromExportProcessor);
  });

  it('should export catalog to Prom.ua in full_overwrite mode', async () => {
    limanService.getProducts
      .mockResolvedValueOnce({
        total: 2,
        page: 1,
        limit: 500,
        items: [
          { tcod: 101, name: 'Apple iPhone 13', price: 25000, stock: 3, barcode: '1111111111111', categoryGroup: 'grp-1' },
          { tcod: 102, name: 'Samsung Galaxy S22', price: 23000, stock: 0, barcode: '2222222222222', categoryGroup: 'grp-1' },
        ] as any,
      })
      .mockResolvedValueOnce({ total: 2, page: 2, limit: 500, items: [] });

    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'full_overwrite' as const,
        exportPrices: true,
        exportStock: true,
        exportDescriptions: true,
        exportImages: true,
        exportCategories: true,
      },
      updateProgress: jest.fn(),
    } as any;

    const result = await processor.process(mockJob);

    expect(result.success).toBe(true);
    expect(result.totalExported).toBe(2);
    expect(promClient.editProductsByExternalId).toHaveBeenCalledWith(
      'test-prom-key',
      expect.arrayContaining([
        expect.objectContaining({ id: '101', name: 'Apple iPhone 13', price: 25000, presence: 'available' }),
        expect.objectContaining({ id: '102', name: 'Samsung Galaxy S22', price: 23000, presence: 'not_available' }),
      ]),
    );
    expect(productMappingService.saveBatchMappings).toHaveBeenCalled();
  });

  it('should filter only new items in only_new mode', async () => {
    limanService.getProducts
      .mockResolvedValueOnce({
        total: 2,
        page: 1,
        limit: 500,
        items: [
          { tcod: 101, name: 'Existing 101', price: 100, stock: 1 },
          { tcod: 102, name: 'New 102', price: 200, stock: 2 },
        ] as any,
      })
      .mockResolvedValueOnce({ total: 2, page: 2, limit: 500, items: [] });

    promClient.editProductsByExternalId.mockResolvedValue({
      success: true,
      processed: 1,
      processedIds: ['102'],
    });

    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'only_new' as const,
      },
      updateProgress: jest.fn(),
    } as any;

    const result = await processor.process(mockJob);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(1);
    expect(result.totalExported).toBe(1);
    expect(promClient.editProductsByExternalId).toHaveBeenCalledWith(
      'test-prom-key',
      expect.arrayContaining([
        expect.objectContaining({ id: '102' }),
      ]),
    );
  });

  it('should handle zero exported items with actionable warning when products do not exist', async () => {
    limanService.getProducts
      .mockResolvedValueOnce({
        total: 1,
        page: 1,
        limit: 500,
        items: [{ tcod: 999, name: 'Unknown Product', price: 100, stock: 5 }] as any,
      })
      .mockResolvedValueOnce({ total: 1, page: 2, limit: 500, items: [] });

    promClient.editProductsByExternalId.mockResolvedValue({
      success: true,
      processed: 0,
      processedIds: [],
      errors: { '999': { id: 'Продукт не найден' } },
    });

    const mockJob = {
      data: { tenantId: 'columb', mode: 'full_overwrite' as const },
      updateProgress: jest.fn(),
    } as any;

    const result = await processor.process(mockJob);

    expect(result.success).toBe(false);
    expect(result.totalExported).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.message).toContain('feed.xml');
    expect(promSyncService.addActivity).toHaveBeenCalledWith(
      'columb',
      expect.objectContaining({
        status: 'warning',
      }),
    );
  });

  it('should omit price and set presence to not_available when product price <= 0', async () => {
    limanService.getProducts
      .mockResolvedValueOnce({
        total: 2,
        page: 1,
        limit: 500,
        items: [
          { tcod: 201, name: 'Normal Item', price: 150, stock: 5 },
          { tcod: 202, name: 'Zero Price Item', price: 0, stock: 10 },
        ] as any,
      })
      .mockResolvedValueOnce({ total: 2, page: 2, limit: 500, items: [] });

    promClient.editProductsByExternalId.mockResolvedValue({
      success: true,
      processed: 2,
      processedIds: ['201', '202'],
    });

    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'full_overwrite' as const,
        exportPrices: true,
        exportStock: true,
      },
      updateProgress: jest.fn(),
    } as any;

    const result = await processor.process(mockJob);

    expect(result.success).toBe(true);
    expect(result.totalExported).toBe(2);
    expect(promClient.editProductsByExternalId).toHaveBeenCalledWith(
      'test-prom-key',
      [
        expect.objectContaining({
          id: '201',
          name: 'Normal Item',
          price: 150,
          presence: 'available',
        }),
        expect.objectContaining({
          id: '202',
          name: 'Zero Price Item',
          presence: 'not_available',
        }),
      ],
    );

    const callArgs = promClient.editProductsByExternalId.mock.calls[0][1];
    const zeroPriceItem = callArgs.find((item) => item.id === '202');
    expect(zeroPriceItem?.price).toBeUndefined();
  });

  it('should report pendingFeedCount and informative message when items are not found on Prom', async () => {
    limanService.getProducts
      .mockResolvedValueOnce({
        total: 2,
        page: 1,
        limit: 500,
        items: [
          { tcod: 301, name: 'Existing Item', price: 200, stock: 4 },
          { tcod: 302, name: 'New Item Not In Prom', price: 300, stock: 1 },
        ] as any,
      })
      .mockResolvedValueOnce({ total: 2, page: 2, limit: 500, items: [] });

    promClient.editProductsByExternalId.mockResolvedValue({
      success: true,
      processed: 1,
      processedIds: ['301'],
      errors: {
        '302': { id: 'Продукт не найден' },
      },
    });

    const mockJob = {
      data: { tenantId: 'columb', mode: 'full_overwrite' as const },
      updateProgress: jest.fn(),
    } as any;

    const result = await processor.process(mockJob);

    expect(result.totalExported).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.pendingFeedCount).toBe(1);
    expect(result.message).toContain('Ожидают импорта через YML-фид: 1');
    expect(promSyncService.addActivity).toHaveBeenCalledWith(
      'columb',
      expect.objectContaining({
        status: 'warning',
        titleRu: expect.stringContaining('ожидают фид 1'),
      }),
    );
  });
});
