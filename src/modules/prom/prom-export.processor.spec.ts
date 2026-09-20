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
      editProducts: jest.fn().mockResolvedValue({ success: true, processed: 2 }),
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
          {
            tcod: 101,
            name: 'Apple iPhone 13',
            price: 25000,
            stock: 3,
            barcode: '1111111111111',
            categoryGroup: 'grp-1',
          },
          {
            tcod: 102,
            name: 'Samsung Galaxy S22',
            price: 23000,
            stock: 0,
            barcode: '2222222222222',
            categoryGroup: 'grp-1',
          },
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
    expect(promClient.editProducts).toHaveBeenCalledWith(
      'test-prom-key',
      expect.arrayContaining([
        expect.objectContaining({
          external_id: '101',
          name: 'Apple iPhone 13',
          price: 25000,
          presence: 'available',
          category_id: 456,
        }),
        expect.objectContaining({
          external_id: '102',
          name: 'Samsung Galaxy S22',
          price: 23000,
          presence: 'not_available',
          category_id: 456,
        }),
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

    promClient.editProducts.mockResolvedValue({ success: true, processed: 1 });

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
    expect(promClient.editProducts).toHaveBeenCalledWith(
      'test-prom-key',
      expect.arrayContaining([
        expect.objectContaining({ external_id: '102' }),
      ]),
    );
  });
});
