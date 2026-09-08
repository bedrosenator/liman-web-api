import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TelegramService } from './telegram.service';
import { AlertPayload } from './interfaces/alert.interface';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TelegramService', () => {
  let service: TelegramService;

  const mockPayload: AlertPayload = {
    level: 'CRITICAL',
    source: 'woocommerce',
    tenantId: 'columb',
    title: 'Auth failed <token>',
    message: 'Invalid consumer key & secret',
    errorDetails: 'Error: 401 Unauthorized',
    timestamp: new Date('2026-09-08T12:00:00Z'),
  };

  describe('with mock/unconfigured tokens', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => undefined),
            },
          },
        ],
      }).compile();

      service = module.get<TelegramService>(TelegramService);
    });

    it('should format HTML properly and escape special characters', () => {
      const html = service.formatMessage(mockPayload, 3);
      expect(html).toContain('🚨 <b>[CRITICAL]</b>');
      expect(html).toContain('<b>[Tenant: columb]</b>');
      expect(html).toContain('&lt;token&gt;');
      expect(html).toContain('Invalid consumer key &amp; secret');
      expect(html).toContain('Error: 401 Unauthorized');
      expect(html).toContain('повторилась 3 раз(а)');
    });

    it('should fallback to MOCK mode without sending real HTTP requests', async () => {
      const result = await service.sendAlert(mockPayload);
      expect(result.success).toBe(true);
      expect(result.mocked).toBe(true);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('with valid Telegram configuration', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'TELEGRAM_BOT_TOKEN') return '12345:TOKEN';
                if (key === 'TELEGRAM_CHAT_ID') return '-100987654321';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<TelegramService>(TelegramService);
    });

    it('should call Telegram API via axios.post when configured', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { ok: true } });

      const result = await service.sendAlert(mockPayload);
      expect(result.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.telegram.org/bot12345:TOKEN/sendMessage',
        expect.objectContaining({
          chat_id: '-100987654321',
          parse_mode: 'HTML',
        }),
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('should handle axios errors gracefully without throwing', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: { data: { description: 'Bad Request: chat not found' } },
      });

      const result = await service.sendAlert(mockPayload);
      expect(result.success).toBe(false);
      expect(result.error).toContain('chat not found');
    });
  });
});
