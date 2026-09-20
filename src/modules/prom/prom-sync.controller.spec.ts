import { Test, TestingModule } from '@nestjs/testing';
import { PromSyncController } from './prom-sync.controller';
import { PromApiClient } from './prom-api.client';
import { PromSyncService } from './prom-sync.service';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue/queue.constants';

describe('PromSyncController', () => {
  let controller: PromSyncController;
  let promApiClient: jest.Mocked<PromApiClient>;
  let tenantService: jest.Mocked<TenantService>;
  let promSyncService: jest.Mocked<PromSyncService>;
  let exportQueue: { add: jest.Mock };
  let importQueue: { add: jest.Mock };

  const mockTenant = {
    id: 'columb',
    name: 'Columb Shop',
    promApiKey: 'test-prom-key',
    promShopTitle: null,
  };

  beforeEach(async () => {
    const mockClient = {
      ping: jest.fn().mockResolvedValue({
        connected: true,
        shopTitle: 'Columb Prom Store',
      }),
      getProducts: jest.fn().mockResolvedValue([]),
      getOrders: jest.fn().mockResolvedValue([]),
      editProductsById: jest.fn().mockResolvedValue({ processed: 1 }),
    };

    const mockTenantSvc = {
      findOne: jest.fn().mockResolvedValue({ ...mockTenant }),
      update: jest.fn().mockResolvedValue({}),
    };

    const mockSyncSvc = {
      getActivities: jest.fn().mockReturnValue([]),
      getMappingStats: jest.fn().mockResolvedValue({ total: 0, synced: 0, error: 0 }),
      syncPricesAndStocks: jest.fn().mockResolvedValue({
        success: true,
        total: 10,
        processed: 10,
        errors: 0,
        durationMs: 120,
      }),
      syncOrders: jest.fn().mockResolvedValue({
        processedOrders: 1,
        skippedOrders: 0,
        itemsDeducted: [{ tcod: 101, qty: 1 }],
        errors: [],
      }),
      getGroups: jest.fn().mockResolvedValue([
        { id: 1, name: 'Категория 1', parent_group_id: null },
      ]),
    };

    const mockLimanSvc = {};

    exportQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-prom-exp-123' }),
    };

    importQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-prom-imp-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromSyncController],
      providers: [
        { provide: PromApiClient, useValue: mockClient },
        { provide: PromSyncService, useValue: mockSyncSvc },
        { provide: LimanService, useValue: mockLimanSvc },
        { provide: TenantService, useValue: mockTenantSvc },
        {
          provide: getQueueToken(QUEUE_NAMES.IMPORT_PROM_CATALOG),
          useValue: importQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.EXPORT_PROM_CATALOG),
          useValue: exportQueue,
        },
      ],
    }).compile();

    controller = module.get<PromSyncController>(PromSyncController);
    promApiClient = module.get(PromApiClient);
    tenantService = module.get(TenantService);
    promSyncService = module.get(PromSyncService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should ping Prom and update tenant.promShopTitle if changed', async () => {
    const res = await controller.ping('columb');

    expect(tenantService.findOne).toHaveBeenCalledWith('columb');
    expect(promApiClient.ping).toHaveBeenCalledWith('test-prom-key');
    expect(tenantService.update).toHaveBeenCalledWith('columb', {
      promShopTitle: 'Columb Prom Store',
    });
    expect(res.shopTitle).toBe('Columb Prom Store');
    expect(res.connected).toBe(true);
  });

  it('should queue export catalog job into export-prom-catalog queue', async () => {
    const res = await controller.triggerCatalogExport('columb', {
      mode: 'only_new',
      exportPrices: true,
      exportStock: true,
      limit: 25,
      defaultGroupId: 12345,
    });

    expect(exportQueue.add).toHaveBeenCalledWith(
      'export-prom-catalog-job',
      expect.objectContaining({
        tenantId: 'columb',
        mode: 'only_new',
        exportPrices: true,
        exportStock: true,
        limit: 25,
        defaultGroupId: 12345,
      }),
      expect.any(Object),
    );

    expect(res.success).toBe(true);
    expect(res.jobId).toBe('job-prom-exp-123');
    expect(res.queue).toBe(QUEUE_NAMES.EXPORT_PROM_CATALOG);
  });

  it('should queue import catalog job into import-prom-catalog queue', async () => {
    const res = await controller.triggerCatalogImport('columb', {
      mode: 'only_new',
      updatePrices: true,
      updateStock: true,
      limit: 50,
    });

    expect(importQueue.add).toHaveBeenCalledWith(
      'import-prom-catalog-job',
      expect.objectContaining({
        tenantId: 'columb',
        mode: 'only_new',
        updatePrices: true,
        updateStock: true,
        limit: 50,
      }),
      expect.any(Object),
    );

    expect(res.success).toBe(true);
    expect(res.jobId).toBe('job-prom-imp-123');
    expect(res.queue).toBe(QUEUE_NAMES.IMPORT_PROM_CATALOG);
  });

  it('should return export categories matching Prom groups', async () => {
    const res = await controller.getExportCategories('columb');

    expect(promSyncService.getGroups).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.categories).toEqual([
      { id: 1, name: 'Категория 1', parentId: null },
    ]);
  });
});
