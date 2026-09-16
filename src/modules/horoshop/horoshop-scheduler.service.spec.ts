import { Test, TestingModule } from '@nestjs/testing';
import { HoroshopSchedulerService } from './horoshop-scheduler.service';
import { TenantService } from '../tenant/tenant.service';
import { SyncService } from '../queue/sync.service';
import { HoroshopSyncService } from './horoshop-sync.service';

describe('HoroshopSchedulerService', () => {
  let service: HoroshopSchedulerService;
  let tenantService: jest.Mocked<TenantService>;
  let syncService: jest.Mocked<SyncService>;
  let horoshopSyncService: jest.Mocked<HoroshopSyncService>;

  beforeEach(async () => {
    tenantService = {
      findAll: jest.fn(),
      update: jest.fn(),
    } as any;

    syncService = {
      triggerStockSync: jest.fn(),
    } as any;

    horoshopSyncService = {
      syncOrders: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoroshopSchedulerService,
        { provide: TenantService, useValue: tenantService },
        { provide: SyncService, useValue: syncService },
        { provide: HoroshopSyncService, useValue: horoshopSyncService },
      ],
    }).compile();

    service = module.get<HoroshopSchedulerService>(HoroshopSchedulerService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should trigger stock sync when tenant autoSync is due', async () => {
    const mockTenant = {
      id: 'columb',
      isActive: true,
      horoshopExportEnabled: true,
      horoshopDomain: 'shop724088.horoshop.ua',
      horoshopSyncIntervalMinutes: 15,
      lastSyncAt: new Date(Date.now() - 20 * 60 * 1000), // 20 mins ago
    };

    tenantService.findAll.mockResolvedValue([mockTenant as any]);
    horoshopSyncService.syncOrders.mockResolvedValue({
      totalFetched: 1,
      processedOrders: 1,
      skippedOrders: 0,
      itemsDeducted: [{ orderId: 1, tcod: 10, qty: 1, oldStock: 5, newStock: 4 }],
    });

    await service.handleCronTick();

    expect(syncService.triggerStockSync).toHaveBeenCalledWith('columb', 'horoshop');
    expect(tenantService.update).toHaveBeenCalledWith('columb', expect.objectContaining({
      lastSyncAt: expect.any(Date),
    }));
  });

  it('should skip tenants with disabled autoSync or missing domain', async () => {
    tenantService.findAll.mockResolvedValue([
      { id: 'disabled', isActive: true, horoshopExportEnabled: false, horoshopDomain: 'd.ua' } as any,
      { id: 'no-domain', isActive: true, horoshopExportEnabled: true, horoshopDomain: '' } as any,
    ]);

    await service.handleCronTick();

    expect(syncService.triggerStockSync).not.toHaveBeenCalled();
    expect(horoshopSyncService.syncOrders).not.toHaveBeenCalled();
  });
});
