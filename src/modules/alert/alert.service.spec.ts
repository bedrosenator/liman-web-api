import { Test, TestingModule } from '@nestjs/testing';
import { AlertService } from './alert.service';
import { AlertThrottlerService } from './alert-throttler.service';
import { TelegramService } from './telegram.service';
import { WebhookService } from './webhook.service';

describe('AlertService', () => {
  let alertService: AlertService;
  let throttler: AlertThrottlerService;
  let telegramService: TelegramService;
  let webhookService: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: AlertThrottlerService,
          useValue: {
            check: jest.fn(),
          },
        },
        {
          provide: TelegramService,
          useValue: {
            sendAlert: jest.fn().mockResolvedValue({ success: true }),
          },
        },
        {
          provide: WebhookService,
          useValue: {
            sendAlert: jest.fn().mockResolvedValue({ success: true, skipped: true }),
          },
        },
      ],
    }).compile();

    alertService = module.get<AlertService>(AlertService);
    throttler = module.get<AlertThrottlerService>(AlertThrottlerService);
    telegramService = module.get<TelegramService>(TelegramService);
    webhookService = module.get<WebhookService>(WebhookService);
  });

  it('should dispatch alert to Telegram and Webhook when throttler permits', async () => {
    (throttler.check as jest.Mock).mockReturnValue({
      shouldSend: true,
      repeatCount: 1,
      suppressedCount: 0,
    });

    const result = await alertService.sendCritical(
      'mariadb',
      'DB Error',
      'Timeout occurred',
      'Stack details',
      'columb',
    );

    expect(result.sent).toBe(true);
    expect(result.throttled).toBe(false);
    expect(telegramService.sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'CRITICAL',
        source: 'mariadb',
        tenantId: 'columb',
        title: 'DB Error',
      }),
      0,
    );
    expect(webhookService.sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'CRITICAL',
        source: 'mariadb',
      }),
      0,
    );
  });

  it('should suppress dispatch when throttled', async () => {
    (throttler.check as jest.Mock).mockReturnValue({
      shouldSend: false,
      repeatCount: 5,
      suppressedCount: 4,
    });

    const result = await alertService.sendCritical(
      'mariadb',
      'DB Error',
      'Timeout occurred',
    );

    expect(result.sent).toBe(false);
    expect(result.throttled).toBe(true);
    expect(telegramService.sendAlert).not.toHaveBeenCalled();
    expect(webhookService.sendAlert).not.toHaveBeenCalled();
  });

  it('should format helpers with correct level and source', async () => {
    (throttler.check as jest.Mock).mockReturnValue({
      shouldSend: true,
      repeatCount: 1,
      suppressedCount: 0,
    });

    await alertService.sendWarning('rozetka', 'Low stock', 'Item 123 has 1 left');
    expect(telegramService.sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'WARNING',
        source: 'rozetka',
      }),
      0,
    );

    await alertService.sendInfo('woocommerce', 'Sync finished', '10 items updated');
    expect(telegramService.sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'INFO',
        source: 'woocommerce',
      }),
      0,
    );
  });
});
