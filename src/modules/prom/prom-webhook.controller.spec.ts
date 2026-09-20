import { Test, TestingModule } from '@nestjs/testing';
import { PromWebhookController } from './prom-webhook.controller';
import { LimanService } from '../liman/liman.service';
import { LimanOrderService } from '../liman/liman-order.service';
import { TenantService } from '../tenant/tenant.service';
import { PromSyncService } from './prom-sync.service';

describe('PromWebhookController', () => {
  let controller: PromWebhookController;
  let tenantService: jest.Mocked<TenantService>;
  let limanOrderService: jest.Mocked<LimanOrderService>;
  let promSyncService: jest.Mocked<PromSyncService>;

  const mockTenant = {
    id: 'columb',
    name: 'Columb Shop',
    promApiKey: 'test-prom-key',
    promOrderWebhookEnabled: true,
    promCreateOrderDocumentEnabled: false,
  };

  beforeEach(async () => {
    const mockTenantSvc = {
      findOne: jest.fn().mockResolvedValue({ ...mockTenant }),
    };

    const mockOrderSvc = {
      markOrderProcessed: jest.fn().mockReturnValue(true),
      processIncomingOrder: jest.fn().mockResolvedValue({
        success: true,
        mode: 'deduct_only',
        deductedItems: [{ tcod: 101, qty: 2, oldStock: 10, newStock: 8 }],
        skippedArticles: [],
        warnings: [],
      }),
    };

    const mockSyncSvc = {
      resolveIntegration: jest.fn().mockResolvedValue({ id: 'integ-123' }),
      addActivity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromWebhookController],
      providers: [
        { provide: LimanService, useValue: {} },
        { provide: LimanOrderService, useValue: mockOrderSvc },
        { provide: TenantService, useValue: mockTenantSvc },
        { provide: PromSyncService, useValue: mockSyncSvc },
      ],
    }).compile();

    controller = module.get<PromWebhookController>(PromWebhookController);
    tenantService = module.get(TenantService);
    limanOrderService = module.get(LimanOrderService);
    promSyncService = module.get(PromSyncService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should skip webhook when promOrderWebhookEnabled is false', async () => {
    tenantService.findOne.mockResolvedValueOnce({
      ...mockTenant,
      promOrderWebhookEnabled: false,
    } as any);

    const res = await controller.handleOrderWebhook('columb', {
      order_id: 12345,
      products: [{ external_id: '101', quantity: 1, price: 100 }],
    });

    expect(res.success).toBe(false);
    expect(res.disabled).toBe(true);
    expect(limanOrderService.processIncomingOrder).not.toHaveBeenCalled();
  });

  it('should skip deduplicated orders when already processed', async () => {
    limanOrderService.markOrderProcessed.mockReturnValueOnce(false);

    const res = await controller.handleOrderWebhook('columb', {
      order_id: 12345,
      products: [{ external_id: '101', quantity: 1, price: 100 }],
    });

    expect(res.success).toBe(true);
    expect(res.message).toContain('уже был обработан');
    expect(limanOrderService.processIncomingOrder).not.toHaveBeenCalled();
  });

  it('should process order and pass unified DTO to LimanOrderService', async () => {
    const res = await controller.handleOrderWebhook('columb', {
      order_id: 998877,
      client_first_name: 'Олег',
      client_last_name: 'Петров',
      phone: '+380991112233',
      delivery_address: 'Київ, Відділення 4',
      products: [
        { external_id: '101', name: 'Сигарети', quantity: 2, price: 95 },
      ],
    });

    expect(limanOrderService.markOrderProcessed).toHaveBeenCalledWith(
      'columb',
      'prom',
      '998877',
    );
    expect(limanOrderService.processIncomingOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'columb' }),
      expect.objectContaining({
        source: 'prom',
        externalOrderId: '998877',
        customerName: 'Олег Петров',
        customerPhone: '+380991112233',
        lineItems: [
          {
            externalArticle: '101',
            name: 'Сигарети',
            quantity: 2,
            price: 95,
          },
        ],
      }),
      'integ-123',
    );

    expect(res.success).toBe(true);
    expect(res.mode).toBe('deduct_only');
    expect(res.processedItems).toEqual([
      { tcod: 101, requestedQty: 2, oldStock: 10, newStock: 8 },
    ]);
    expect(promSyncService.addActivity).toHaveBeenCalledWith(
      'columb',
      expect.objectContaining({ type: 'order', status: 'success' }),
    );
  });
});
