import { Test, TestingModule } from '@nestjs/testing';
import { HoroshopExportProcessor } from './horoshop-export.processor';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { HoroshopApiClient } from './horoshop-api.client';
import { HoroshopSyncService } from './horoshop-sync.service';
import { ProductMappingService } from '../tenant/product-mapping.service';
import { Tenant } from '../tenant/tenant.entity';
import { Job } from 'bullmq';
import { ExportHoroshopCatalogJobData } from '../queue/queue.constants';

describe('HoroshopExportProcessor', () => {
  let processor: HoroshopExportProcessor;
  let limanService: jest.Mocked<LimanService>;
  let tenantService: jest.Mocked<TenantService>;
  let horoshopClient: jest.Mocked<HoroshopApiClient>;
  let syncService: jest.Mocked<HoroshopSyncService>;
  let productMappingService: jest.Mocked<ProductMappingService>;

  const mockTenant: Partial<Tenant> = {
    id: 'columb',
    name: 'Columb Shop',
    horoshopDomain: 'columb.horoshop.ua',
    horoshopLogin: 'admin',
    horoshopShopTitle: 'Columb Online Store',
    priceColumn: 'cena2',
    stockColumn: 'skl_k',
  };

  const mockCategories = [
    { group: '01', name: 'Сигареты', parent: null },
    { group: '02', name: 'Напитки', parent: null },
  ];

  const mockProducts = [
    {
      tcod: 101,
      name: 'Product 101',
      price: 150,
      stock: 10,
      isAvailable: true,
      categoryGroup: '01',
      barcode: '482000000101',
      description: 'Desc 101',
      imageUrls: ['https://example.com/101.jpg'],
    },
    {
      tcod: 102,
      name: 'Product 102',
      price: 250,
      stock: 0,
      isAvailable: false,
      categoryGroup: '02',
      barcode: '482000000102',
      description: 'Desc 102',
      imageUrls: [],
    },
  ];

  beforeEach(async () => {
    const mockLimanService = {
      getCategories: jest.fn().mockResolvedValue(mockCategories),
      getProducts: jest.fn().mockResolvedValue({
        items: mockProducts,
        total: 2,
        page: 1,
        limit: 100,
      }),
    };

    const mockTenantService = {
      findOne: jest.fn().mockResolvedValue(mockTenant),
    };

    const mockHoroshopClient = {
      importCatalog: jest.fn().mockResolvedValue({
        success: true,
        total: 2,
        created: 1,
        updated: 1,
        log: [
          { code: 0, article: '101', message: 'OK' },
          { code: 0, article: '102', message: 'OK' },
        ],
      }),
      getCatalogCategories: jest.fn().mockResolvedValue([
        { id: 1072, title: 'iPhone 13', fullPath: 'Електроніка/Смартфони/iPhone 13' },
      ]),
    };

    const mockSyncService = {
      addActivity: jest.fn(),
    };

    const mockProductMappingService = {
      resolveActiveIntegration: jest.fn().mockResolvedValue({
        id: 'integration-uuid-1',
        tenantId: 'columb',
        platform: 'horoshop',
        name: 'Columb Online Store',
      }),
      getAllMappedTcods: jest.fn().mockResolvedValue(new Set([101])),
      saveBatchMappings: jest.fn().mockResolvedValue(2),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoroshopExportProcessor,
        { provide: LimanService, useValue: mockLimanService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: HoroshopApiClient, useValue: mockHoroshopClient },
        { provide: HoroshopSyncService, useValue: mockSyncService },
        { provide: ProductMappingService, useValue: mockProductMappingService },
      ],
    }).compile();

    processor = module.get<HoroshopExportProcessor>(HoroshopExportProcessor);
    limanService = module.get(LimanService);
    tenantService = module.get(TenantService);
    horoshopClient = module.get(HoroshopApiClient);
    syncService = module.get(HoroshopSyncService);
    productMappingService = module.get(ProductMappingService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should export all products in full_overwrite mode and update progress', async () => {
    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'full_overwrite',
        exportPrices: true,
        exportStock: true,
        exportDescriptions: true,
        exportImages: true,
        exportCategories: true,
      } as ExportHoroshopCatalogJobData,
      updateProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<ExportHoroshopCatalogJobData>;

    const result = await processor.process(mockJob);

    expect(tenantService.findOne).toHaveBeenCalledWith('columb');
    expect(limanService.getCategories).toHaveBeenCalled();
    expect(limanService.getProducts).toHaveBeenCalled();
    expect(horoshopClient.importCatalog).toHaveBeenCalledTimes(1);

    const callPayload = horoshopClient.importCatalog.mock.calls[0][1];
    expect(callPayload.products).toHaveLength(2);
    expect(callPayload.products[0]).toEqual({
      article: '101',
      title: 'Product 101',
      price: 150,
      quantity: 10,
      presence: 1,
      barcode: '482000000101',
      parent: 'Сигареты',
      description: 'Desc 101',
      images: ['https://example.com/101.jpg'],
    });

    expect(productMappingService.saveBatchMappings).toHaveBeenCalledTimes(1);
    expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    expect(syncService.addActivity).toHaveBeenCalledWith(
      'columb',
      expect.objectContaining({
        type: 'sync',
        status: 'success',
        titleRu: expect.stringContaining('Прямой экспорт в Хорошоп'),
      }),
    );

    expect(result.success).toBe(true);
    expect(result.totalExported).toBe(2);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
  });

  it('should filter only unmapped products in only_new mode', async () => {
    // 101 is already mapped, so only 102 should be exported
    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'only_new',
      } as ExportHoroshopCatalogJobData,
      updateProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<ExportHoroshopCatalogJobData>;

    const result = await processor.process(mockJob);

    expect(horoshopClient.importCatalog).toHaveBeenCalledTimes(1);
    const callPayload = horoshopClient.importCatalog.mock.calls[0][1];
    expect(callPayload.products).toHaveLength(1);
    expect(callPayload.products[0].article).toBe('102');
    expect(result.totalExported).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('should filter only mapped products in update_existing mode', async () => {
    // 101 is mapped, 102 is not
    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'update_existing',
      } as ExportHoroshopCatalogJobData,
      updateProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<ExportHoroshopCatalogJobData>;

    const result = await processor.process(mockJob);

    expect(horoshopClient.importCatalog).toHaveBeenCalledTimes(1);
    const callPayload = horoshopClient.importCatalog.mock.calls[0][1];
    expect(callPayload.products).toHaveLength(1);
    expect(callPayload.products[0].article).toBe('101');
    expect(result.totalExported).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('should handle empty database gracefully without calling API', async () => {
    limanService.getProducts.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
    });

    const mockJob = {
      data: {
        tenantId: 'columb',
      } as ExportHoroshopCatalogJobData,
      updateProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<ExportHoroshopCatalogJobData>;

    const result = await processor.process(mockJob);

    expect(horoshopClient.importCatalog).not.toHaveBeenCalled();
    expect(result.totalExported).toBe(0);
    expect(result.totalFetched).toBe(0);
    expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
  });

  it('should paginate through limanService.getProducts if catalog has multiple pages (>500 items)', async () => {
    const page1Items = Array.from({ length: 500 }, (_, i) => ({
      tcod: i + 1,
      name: `Product ${i + 1}`,
      price: 100,
      stock: 5,
      isAvailable: true,
      categoryGroup: '01',
    }));
    const page2Items = Array.from({ length: 150 }, (_, i) => ({
      tcod: 500 + i + 1,
      name: `Product ${500 + i + 1}`,
      price: 200,
      stock: 3,
      isAvailable: true,
      categoryGroup: '01',
    }));

    limanService.getProducts
      .mockResolvedValueOnce({
        items: page1Items,
        total: 650,
        page: 1,
        limit: 500,
      })
      .mockResolvedValueOnce({
        items: page2Items,
        total: 650,
        page: 2,
        limit: 500,
      });

    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'full_overwrite',
      } as ExportHoroshopCatalogJobData,
      updateProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<ExportHoroshopCatalogJobData>;

    const result = await processor.process(mockJob);

    expect(limanService.getProducts).toHaveBeenCalledTimes(2);
    expect(limanService.getProducts).toHaveBeenNthCalledWith(1, mockTenant, {
      page: 1,
      limit: 500,
    });
    expect(limanService.getProducts).toHaveBeenNthCalledWith(2, mockTenant, {
      page: 2,
      limit: 500,
    });
    expect(result.totalFetched).toBe(650);
    expect(result.totalExported).toBe(650);
  });

  it('should apply defaultCategoryPath when Limansoft category is not found in Horoshop', async () => {
    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'full_overwrite',
        defaultCategoryPath: 'Електроніка/Смартфони/iPhone 13',
      } as ExportHoroshopCatalogJobData,
      updateProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<ExportHoroshopCatalogJobData>;

    await processor.process(mockJob);

    expect(horoshopClient.importCatalog).toHaveBeenCalledTimes(1);
    const callPayload = (horoshopClient.importCatalog as jest.Mock).mock.calls[0][1];
    expect(callPayload.products[0].parent).toBe('Електроніка/Смартфони/iPhone 13');
  });
});

