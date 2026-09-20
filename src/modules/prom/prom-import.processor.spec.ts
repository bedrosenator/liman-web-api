import { Test, TestingModule } from '@nestjs/testing';
import { PromImportProcessor } from './prom-import.processor';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { PromApiClient } from './prom-api.client';
import { PromSyncService } from './prom-sync.service';
import { BackupService } from '../backup/backup.service';
import { ProductMappingService } from '../tenant/product-mapping.service';

describe('PromImportProcessor', () => {
  let processor: PromImportProcessor;
  let limanService: jest.Mocked<LimanService>;
  let tenantService: jest.Mocked<TenantService>;
  let promClient: jest.Mocked<PromApiClient>;
  let promSyncService: jest.Mocked<PromSyncService>;
  let backupService: jest.Mocked<BackupService>;
  let productMappingService: any;

  beforeEach(async () => {
    limanService = {
      findProductBySkuOrBarcode: jest.fn(),
      upsertProductFromExternal: jest.fn(),
    } as any;

    tenantService = {
      findOne: jest.fn(),
    } as any;

    promClient = {
      getProducts: jest.fn(),
    } as any;

    promSyncService = {
      resolveIntegration: jest.fn().mockResolvedValue({ id: 'integ-prom-1' }),
      addActivity: jest.fn(),
    } as any;

    backupService = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      createBackup: jest.fn().mockResolvedValue({
        filename: 'backup_prom_fast.sql.gz',
        mode: 'fast',
        createdAt: new Date().toISOString(),
        sizeBytes: 1024,
        sizeMb: '1MB',
        sha256: 'abc',
      }),
    } as any;

    productMappingService = {
      resolveActiveIntegration: jest.fn().mockResolvedValue({ id: 'integ-prom-1' }),
      saveMapping: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromImportProcessor,
        { provide: LimanService, useValue: limanService },
        { provide: TenantService, useValue: tenantService },
        { provide: PromApiClient, useValue: promClient },
        { provide: PromSyncService, useValue: promSyncService },
        { provide: BackupService, useValue: backupService },
        { provide: ProductMappingService, useValue: productMappingService },
      ],
    }).compile();

    processor = module.get<PromImportProcessor>(PromImportProcessor);
  });

  it('should import catalog in only_new mode, skipping existing positions', async () => {
    const mockTenant = { id: 'columb', promApiKey: 'prom-key-123' };
    tenantService.findOne.mockResolvedValue(mockTenant as any);

    promClient.getProducts
      .mockResolvedValueOnce([
        { id: 101, external_id: '101', name: 'Existing Item', price: 100, quantity_in_stock: 5 },
        { id: 102, external_id: '102', name: 'Brand New Item', price: 200, quantity_in_stock: 10 },
      ] as any)
      .mockResolvedValueOnce([]);

    limanService.findProductBySkuOrBarcode.mockImplementation(async (_, article) => {
      if (article === '101') return { tcod: 101, name: 'Existing Item' } as any;
      return null;
    });

    limanService.upsertProductFromExternal.mockResolvedValue({
      action: 'created',
      tcod: 102,
    });

    const mockJob = {
      data: {
        tenantId: 'columb',
        mode: 'only_new' as const,
        updatePrices: true,
        updateStock: true,
        updateImages: false,
        createBackup: true,
      },
      updateProgress: jest.fn(),
    } as any;

    const result = await processor.process(mockJob);

    expect(backupService.createBackup).toHaveBeenCalledWith('columb', 'fast');
    expect(backupService.acquireLock).toHaveBeenCalledWith('columb');
    expect(backupService.releaseLock).toHaveBeenCalledWith('columb');
    expect(limanService.upsertProductFromExternal).toHaveBeenCalledTimes(1);
    expect(limanService.upsertProductFromExternal).toHaveBeenCalledWith(
      mockTenant,
      expect.objectContaining({ sku: '102', name: 'Brand New Item' }),
    );
    expect(productMappingService.saveMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'columb',
        externalArticle: '102',
        limanTcod: 102,
        syncStatus: 'synced',
      }),
    );
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.success).toBe(true);
  });
});
