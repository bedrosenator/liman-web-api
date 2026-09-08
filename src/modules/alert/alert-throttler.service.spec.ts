import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlertThrottlerService } from './alert-throttler.service';
import { AlertPayload } from './interfaces/alert.interface';

describe('AlertThrottlerService', () => {
  let service: AlertThrottlerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertThrottlerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ALERT_THROTTLE_MINUTES' || key === 'alerts.throttleMinutes') {
                return 10;
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AlertThrottlerService>(AlertThrottlerService);
  });

  const samplePayload: AlertPayload = {
    level: 'CRITICAL',
    source: 'mariadb',
    tenantId: 'columb',
    title: 'Connection timeout',
    message: 'Could not connect to 127.0.0.1:3306',
  };

  it('should allow first alert and report repeatCount = 1', () => {
    const result = service.check(samplePayload);
    expect(result.shouldSend).toBe(true);
    expect(result.repeatCount).toBe(1);
    expect(result.suppressedCount).toBe(0);
  });

  it('should suppress subsequent duplicate alerts within throttle window', () => {
    // First call
    service.check(samplePayload);

    // Second call within throttle window
    const second = service.check(samplePayload);
    expect(second.shouldSend).toBe(false);
    expect(second.repeatCount).toBe(2);
    expect(second.suppressedCount).toBe(1);

    // Third call
    const third = service.check(samplePayload);
    expect(third.shouldSend).toBe(false);
    expect(third.repeatCount).toBe(3);
    expect(third.suppressedCount).toBe(2);
  });

  it('should distinguish alerts from different tenants or sources', () => {
    service.check(samplePayload);

    const otherTenantPayload: AlertPayload = {
      ...samplePayload,
      tenantId: 'other-shop',
    };
    const otherResult = service.check(otherTenantPayload);
    expect(otherResult.shouldSend).toBe(true);

    const otherSourcePayload: AlertPayload = {
      ...samplePayload,
      source: 'bullmq',
    };
    const otherSourceResult = service.check(otherSourcePayload);
    expect(otherSourceResult.shouldSend).toBe(true);
  });

  it('should reset records when clear() is invoked', () => {
    service.check(samplePayload);
    expect(service.check(samplePayload).shouldSend).toBe(false);

    service.clear();
    expect(service.check(samplePayload).shouldSend).toBe(true);
  });
});
