import { Test, TestingModule } from '@nestjs/testing';
import { PromSchedulerService } from './prom-scheduler.service';
import { TenantService } from '../tenant/tenant.service';
import { SyncService } from '../queue/sync.service';
import { PromSyncService } from './prom-sync.service';

describe('PromSchedulerService', () => {
  let service: PromSchedulerService;
  let tenantService: jest.Mocked<TenantService>;
  let syncService: jest.Mocked<SyncService>;
  let promSyncService: jest.Mocked<PromSyncService>;

  beforeEach(async () => {
    const mockTenantService = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'tenant-active',
          isActive: true,
          promExportEnabled: true,
          promApiKey: 'valid-key',
          promSyncIntervalMinutes: 15,
          lastSyncAt: new Date(Date.now() - 20 * 60 * 1000), // 20 mins ago (> 15)
        },
        {
          id: 'tenant-inactive',
          isActive: false,
          promExportEnabled: true,
          promApiKey: 'valid-key',
        },
        {
          id: 'tenant-disabled-prom',
          isActive: true,
          promExportEnabled: false,
          promApiKey: 'valid-key',
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
    };

    const mockSyncService = {
      triggerStockSync: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockPromSyncService = {
      syncOrders: jest.fn().mockResolvedValue({
        processedOrders: 2,
        skippedOrders: 0,
        itemsDeducted: [{ tcod: 1, qty: 1 }],
        errors: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromSchedulerService,
        { provide: TenantService, useValue: mockTenantService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: PromSyncService, useValue: mockPromSyncService },
      ],
    }).compile();

    service = module.get<PromSchedulerService>(PromSchedulerService);
    tenantService = module.get(TenantService);
    syncService = module.get(SyncService);
    promSyncService = module.get(PromSyncService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should trigger stock sync for active tenant when interval has elapsed', async () => {
    await service.handleCronTick();

    expect(syncService.triggerStockSync).toHaveBeenCalledWith(
      'tenant-active',
      'prom',
    );
    expect(tenantService.update).toHaveBeenCalledWith('tenant-active', {
      lastSyncAt: expect.any(Date),
    });
  });

  it('should trigger order polling on first check or after 15 min', async () => {
    await service.handleCronTick();

    expect(promSyncService.syncOrders).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tenant-active' }),
      { status: 'pending', limit: 20 },
    );
  });
});
