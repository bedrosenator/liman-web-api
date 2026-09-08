import { Injectable, Logger } from '@nestjs/common';
import { AlertPayload, AlertSource } from './interfaces/alert.interface';
import { AlertThrottlerService } from './alert-throttler.service';
import { TelegramService } from './telegram.service';
import { WebhookService } from './webhook.service';

export interface AlertDispatchResult {
  sent: boolean;
  throttled: boolean;
  telegramResult?: { success: boolean; mocked?: boolean; error?: string };
  webhookResult?: { success: boolean; skipped?: boolean; error?: string };
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly throttler: AlertThrottlerService,
    private readonly telegramService: TelegramService,
    private readonly webhookService: WebhookService,
  ) {}

  /**
   * Главный метод отправки алерта с проверкой троттлинга
   */
  async sendAlert(payload: AlertPayload): Promise<AlertDispatchResult> {
    if (!payload.timestamp) {
      payload.timestamp = new Date();
    }

    const { shouldSend, repeatCount, suppressedCount } =
      this.throttler.check(payload);

    if (!shouldSend) {
      this.logger.debug(
        `🔇 Алерт [${payload.source}] "${payload.title}" подавлен троттлингом (повтор #${repeatCount})`,
      );
      return {
        sent: false,
        throttled: true,
      };
    }

    this.logger.log(
      `🚨 Отправка алерта [${payload.level}] (${payload.source}): ${payload.title}`,
    );

    // Параллельная отправка по всем настроенным каналам
    const [telegramResult, webhookResult] = await Promise.all([
      this.telegramService.sendAlert(payload, suppressedCount),
      this.webhookService.sendAlert(payload, suppressedCount),
    ]);

    return {
      sent: true,
      throttled: false,
      telegramResult,
      webhookResult,
    };
  }

  /**
   * Хелпер для быстрой отправки критической ошибки
   */
  async sendCritical(
    source: AlertSource,
    title: string,
    message: string,
    errorDetails?: string,
    tenantId?: string,
    context?: Record<string, unknown>,
  ): Promise<AlertDispatchResult> {
    return this.sendAlert({
      level: 'CRITICAL',
      source,
      tenantId,
      title,
      message,
      errorDetails,
      context,
    });
  }

  /**
   * Хелпер для отправки предупреждения
   */
  async sendWarning(
    source: AlertSource,
    title: string,
    message: string,
    errorDetails?: string,
    tenantId?: string,
    context?: Record<string, unknown>,
  ): Promise<AlertDispatchResult> {
    return this.sendAlert({
      level: 'WARNING',
      source,
      tenantId,
      title,
      message,
      errorDetails,
      context,
    });
  }

  /**
   * Хелпер для отправки информационного уведомления
   */
  async sendInfo(
    source: AlertSource,
    title: string,
    message: string,
    tenantId?: string,
    context?: Record<string, unknown>,
  ): Promise<AlertDispatchResult> {
    return this.sendAlert({
      level: 'INFO',
      source,
      tenantId,
      title,
      message,
      context,
    });
  }
}
