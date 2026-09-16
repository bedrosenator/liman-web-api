import { Test, TestingModule } from '@nestjs/testing';
import { HoroshopImportProcessor } from './horoshop-import.processor';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { HoroshopApiClient } from './horoshop-api.client';
import { HoroshopSyncService } from './horoshop-sync.service';
import { BackupService } from '../backup/backup.service';

describe('HoroshopImportProcessor', () => {
  let processor: HoroshopImportProcessor;
  let limanService: jest.Mocked<LimanService>;
  let tenantService: jest.Mocked<TenantService>;
  let horoshopClient: jest.Mocked<HoroshopApiClient>;
  let horoshopSyncService: jest.Mocked<HoroshopSyncService>;
  let backupService: jest.Mocked<BackupService>;

  beforeEach(async () => {
    limanService = {
      findProductBySkuOrBarcode: jest.fn(),
      upsertProductFromExternal: jest.fn(),
    } as any;

    tenantService = {
      findOne: jest.fn(),
    } as any;

    horoshopClient = {
      exportCatalog: jest.fn(),
    } as any;

    horoshopSyncService = {
      addActivity: jest.fn(),
    } as any;

    backupService = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      createBackup: jest.fn().mockResolvedValue({
        filename: 'backup_fast.sql.gz',
        mode: 'fast',
        createdAt: new Date().toISOString(),
        sizeBytes: 1024,
        sizeMb: '1MB',
        sha256: 'abc',
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoroshopImportProcessor,
        { provide: LimanService, useValue: limanService },
        { provide: TenantService, useValue: tenantService },
        { provide: HoroshopApiClient, useValue: horoshopClient },
        { provide: HoroshopSyncService, useValue: horoshopSyncService },
        { provide: BackupService, useValue: backupService },
      ],
    }).compile();

    processor = module.get<HoroshopImportProcessor>(HoroshopImportProcessor);
  });

  it('should import catalog in only_new mode, skipping existing positions', async () => {
    const mockTenant = { id: 'columb', horoshopDomain: 'shop724088.horoshop.ua' };
    tenantService.findOne.mockResolvedValue(mockTenant as any);

    horoshopClient.exportCatalog
      .mockResolvedValueOnce({
        status: 'OK',
        response: {
          total: 2,
          products: [
            { article: '101', title: 'Existing Item', price: 100, stock: 5 },
            { article: '102', title: 'Brand New Item', price: 200, stock: 10 },
          ],
        },
      })
      .mockResolvedValueOnce({
        status: 'OK',
        response: { products: [] },
      });

    // 101 exists, 102 does not
    limanService.findProductBySkuOrBarcode.mockImplementation(async (_, article) => {
      if (article === '101') return { tcod: 101, name: 'Existing' } as any;
      return null;
    });

    limanService.upsertProductFromExternal.mockResolvedValue({
      tcod: 102,
      action: 'created',
    });

    const mockJob: any = {
      id: 'job-1',
      data: {
        tenantId: 'columb',
        mode: 'only_new',
        createBackup: true,
      },
      updateProgress: jest.fn(),
    };

    const result = await processor.process(mockJob);

    expect(backupService.createBackup).toHaveBeenCalledWith('columb', 'fast');
    expect(backupService.acquireLock).toHaveBeenCalledWith('columb');
    expect(backupService.releaseLock).toHaveBeenCalledWith('columb');

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.totalFetched).toBe(2);
    expect(result.backupId).toBe('backup_fast.sql.gz');
    expect(horoshopSyncService.addActivity).toHaveBeenCalled();
  });
});
