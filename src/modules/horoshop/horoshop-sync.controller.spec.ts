import { Test, TestingModule } from '@nestjs/testing';
import { HoroshopSyncController } from './horoshop-sync.controller';
import { HoroshopApiClient } from './horoshop-api.client';
import { HoroshopSyncService } from './horoshop-sync.service';
import { LimanService } from '../liman/liman.service';
import { LimanOrderService } from '../liman/liman-order.service';
import { TenantService } from '../tenant/tenant.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue/queue.constants';

describe('HoroshopSyncController', () => {
  let controller: HoroshopSyncController;
  let horoshopClient: jest.Mocked<HoroshopApiClient>;
  let tenantService: jest.Mocked<TenantService>;
  let exportQueue: { add: jest.Mock };

  const mockTenant = {
    id: 'columb',
    name: 'Columb Shop',
    horoshopDomain: 'columb.horoshop.ua',
    horoshopShopTitle: null,
  };

  beforeEach(async () => {
    const mockClient = {
      ping: jest.fn().mockResolvedValue({
        connected: true,
        domain: 'columb.horoshop.ua',
        shopTitle: 'Columb Store Official',
        authStatus: 'OK',
      }),
    };

    const mockTenantSvc = {
      findOne: jest.fn().mockResolvedValue({ ...mockTenant }),
      update: jest.fn().mockResolvedValue({}),
    };

    const mockSyncSvc = {
      getActivities: jest.fn().mockReturnValue([]),
      getMappingStats: jest.fn().mockResolvedValue({ total: 0, synced: 0, error: 0 }),
    };

    const mockLimanSvc = {};

    exportQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-exp-123' }),
    };

    const importQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-imp-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HoroshopSyncController],
      providers: [
        { provide: HoroshopApiClient, useValue: mockClient },
        { provide: HoroshopSyncService, useValue: mockSyncSvc },
        { provide: LimanService, useValue: mockLimanSvc },
        { provide: LimanOrderService, useValue: {
          markOrderProcessed: jest.fn().mockReturnValue(true),
          processIncomingOrder: jest.fn().mockResolvedValue({
            success: true, mode: 'deduct_only', deductedItems: [], skippedArticles: [], warnings: [],
          }),
        }},
        { provide: TenantService, useValue: mockTenantSvc },
        {
          provide: getQueueToken(QUEUE_NAMES.IMPORT_HOROSHOP_CATALOG),
          useValue: importQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.EXPORT_HOROSHOP_CATALOG),
          useValue: exportQueue,
        },
      ],
    }).compile();

    controller = module.get<HoroshopSyncController>(HoroshopSyncController);
    horoshopClient = module.get(HoroshopApiClient);
    tenantService = module.get(TenantService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should ping Horoshop and automatically update tenant.horoshopShopTitle', async () => {
    const res = await controller.ping('columb');

    expect(tenantService.findOne).toHaveBeenCalledWith('columb');
    expect(horoshopClient.ping).toHaveBeenCalled();
    expect(tenantService.update).toHaveBeenCalledWith('columb', {
      horoshopShopTitle: 'Columb Store Official',
    });
    expect(res.shopTitle).toBe('Columb Store Official');
    expect(res.connected).toBe(true);
  });

  it('should queue export catalog job into export-horoshop-catalog queue', async () => {
    const res = await controller.triggerCatalogExport('columb', {
      mode: 'only_new',
      exportPrices: true,
      exportStock: true,
      limit: 25,
    });

    expect(exportQueue.add).toHaveBeenCalledWith(
      'export-horoshop-catalog-job',
      expect.objectContaining({
        tenantId: 'columb',
        mode: 'only_new',
        exportPrices: true,
        exportStock: true,
        limit: 25,
      }),
      expect.any(Object),
    );

    expect(res.success).toBe(true);
    expect(res.jobId).toBe('job-exp-123');
    expect(res.queue).toBe(QUEUE_NAMES.EXPORT_HOROSHOP_CATALOG);
  });
});
