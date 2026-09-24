import { Test, TestingModule } from '@nestjs/testing';
import { PromFeedController } from './prom-feed.controller';
import { PromFeedService } from './prom-feed.service';
import { PromApiClient } from './prom-api.client';
import { PromSyncService } from './prom-sync.service';
import { TenantService } from '../tenant/tenant.service';
import { BadRequestException } from '@nestjs/common';

describe('PromFeedController', () => {
  let controller: PromFeedController;
  let promApiClient: jest.Mocked<PromApiClient>;
  let tenantService: jest.Mocked<TenantService>;
  let promFeedService: jest.Mocked<PromFeedService>;
  let promSyncService: jest.Mocked<PromSyncService>;

  const mockTenant = {
    id: 'columb',
    name: 'Columb Shop',
    promApiKey: 'test-prom-key',
  };

  beforeEach(async () => {
    const mockApiClient = {
      importUrl: jest.fn().mockResolvedValue({
        success: true,
        id: '12345',
        message: 'Import scheduled',
      }),
    };

    const mockFeedSvc = {
      streamYmlFeed: jest.fn().mockImplementation((tenant, host, res) => {
        res.status(200).send('<?xml version="1.0"?><yml_catalog></yml_catalog>');
      }),
    };

    const mockTenantSvc = {
      findOne: jest.fn().mockResolvedValue({ ...mockTenant }),
    };

    const mockSyncSvc = {
      addActivity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromFeedController],
      providers: [
        { provide: PromFeedService, useValue: mockFeedSvc },
        { provide: PromApiClient, useValue: mockApiClient },
        { provide: PromSyncService, useValue: mockSyncSvc },
        { provide: TenantService, useValue: mockTenantSvc },
      ],
    }).compile();

    controller = module.get<PromFeedController>(PromFeedController);
    promApiClient = module.get(PromApiClient);
    tenantService = module.get(TenantService);
    promFeedService = module.get(PromFeedService);
    promSyncService = module.get(PromSyncService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFeed', () => {
    it('should call promFeedService.streamYmlFeed with correct host and tenant', async () => {
      const mockReq: any = {
        protocol: 'https',
        get: jest.fn().mockReturnValue('liman.terrace.pp.ua'),
      };
      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.getFeed('columb', mockReq, mockRes);
      expect(tenantService.findOne).toHaveBeenCalledWith('columb');
      expect(promFeedService.streamYmlFeed).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'columb' }),
        'https://liman.terrace.pp.ua',
        mockRes,
      );
    });
  });

  describe('sendFeed', () => {
    it('should throw BadRequestException if promApiKey is not configured', async () => {
      tenantService.findOne.mockResolvedValueOnce({
        id: 'columb',
        name: 'Columb Shop',
        promApiKey: null,
      } as any);

      const mockReq: any = {
        protocol: 'https',
        get: jest.fn().mockReturnValue('liman.terrace.pp.ua'),
      };

      await expect(controller.sendFeed('columb', mockReq)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully send feed to Prom API and record activity', async () => {
      const mockReq: any = {
        protocol: 'https',
        get: jest.fn().mockReturnValue('liman.terrace.pp.ua'),
      };

      const result = await controller.sendFeed('columb', mockReq);

      expect(promApiClient.importUrl).toHaveBeenCalledWith(
        'test-prom-key',
        expect.objectContaining({
          url: 'https://liman.terrace.pp.ua/api/v1/prom/columb/feed.xml',
          force_update: true,
          only_update: false,
        }),
      );
      expect(promSyncService.addActivity).toHaveBeenCalledWith(
        'columb',
        expect.objectContaining({
          type: 'sync',
          status: 'success',
        }),
      );
      expect(result.success).toBe(true);
      expect(result.importId).toBe('12345');
    });

    it('should return error response and record warning activity when Prom API rejects import', async () => {
      const errorWithResponse: any = new Error('Prom error');
      errorWithResponse.response = {
        data: {
          error: {
            status: 400,
            message:
              'В данный момент действует ограничение на запуск одновременных импортов.',
          },
        },
      };
      promApiClient.importUrl.mockRejectedValueOnce(errorWithResponse);

      const mockReq: any = {
        protocol: 'https',
        get: jest.fn().mockReturnValue('liman.terrace.pp.ua'),
      };

      const result = await controller.sendFeed('columb', mockReq);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ограничение на запуск одновременных импортов');
      expect(promSyncService.addActivity).toHaveBeenCalledWith(
        'columb',
        expect.objectContaining({
          type: 'sync',
          status: 'warning',
        }),
      );
    });
  });
});
