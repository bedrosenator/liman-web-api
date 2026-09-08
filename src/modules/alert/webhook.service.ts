import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AlertPayload } from './interfaces/alert.interface';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhookUrl?: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = (
      this.configService.get<string>('alerts.webhookUrl') ??
      this.configService.get<string>('ALERT_WEBHOOK_URL')
    )?.trim();
  }

  /**
   * Отправка JSON-уведомления на внешний HTTP Webhook
   */
  async sendAlert(
    payload: AlertPayload,
    suppressedCount = 0,
  ): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    if (!this.webhookUrl) {
      return { success: true, skipped: true };
    }

    const body = {
      event: 'liman_alert',
      level: payload.level,
      source: payload.source,
      tenantId: payload.tenantId || null,
      title: payload.title,
      message: payload.message,
      errorDetails: payload.errorDetails || null,
      context: payload.context || {},
      suppressedCount,
      timestamp: (payload.timestamp || new Date()).toISOString(),
    };

    try {
      await axios.post(this.webhookUrl, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });

      this.logger.log(`🌐 Алерт успешно отправлен на Webhook: ${this.webhookUrl}`);
      return { success: true };
    } catch (err: any) {
      const errorMsg = err.response?.data || err.message;
      this.logger.error(
        `❌ Ошибка отправки алерта на Webhook (${this.webhookUrl}): ${JSON.stringify(errorMsg)}`,
      );
      return { success: false, error: String(errorMsg) };
    }
  }
}
