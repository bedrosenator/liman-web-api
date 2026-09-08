import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertPayload, ThrottledAlertRecord } from './interfaces/alert.interface';

export interface ThrottleCheckResult {
  shouldSend: boolean;
  repeatCount: number;
  suppressedCount: number;
}

@Injectable()
export class AlertThrottlerService {
  private readonly logger = new Logger(AlertThrottlerService.name);
  private readonly records = new Map<string, ThrottledAlertRecord>();
  private readonly throttleMs: number;

  constructor(private readonly configService: ConfigService) {
    const rawVal =
      this.configService.get<string | number>('alerts.throttleMinutes') ??
      this.configService.get<string | number>('ALERT_THROTTLE_MINUTES') ??
      10;
    const minutes = Number(rawVal);
    this.throttleMs = (isNaN(minutes) || minutes <= 0 ? 10 : minutes) * 60 * 1000;
  }

  /**
   * Генерация уникального ключа дедупликации на основе источника, тенанта и сообщения
   */
  generateKey(payload: AlertPayload): string {
    const tenant = payload.tenantId || 'global';
    const source = payload.source;
    // Очищаем заголовок/сообщение от случайных чисел/id для устойчивого хэширования
    const normalizedTitle = payload.title.trim().toLowerCase();
    return `${source}:${tenant}:${normalizedTitle}`;
  }

  /**
   * Проверка возможности отправки сообщения с защитой от спама
   */
  check(payload: AlertPayload): ThrottleCheckResult {
    const now = Date.now();
    const key = this.generateKey(payload);
    const existing = this.records.get(key);

    this.cleanup(now);

    if (!existing) {
      this.records.set(key, {
        firstSeenAt: now,
        lastSentAt: now,
        count: 1,
      });

      return {
        shouldSend: true,
        repeatCount: 1,
        suppressedCount: 0,
      };
    }

    // Если запись уже есть, инкрементируем счетчик
    existing.count += 1;

    // Проверяем, истек ли интервал троттлинга с момента последней отправки
    if (now - existing.lastSentAt >= this.throttleMs) {
      const suppressed = existing.count - 1;
      existing.lastSentAt = now;
      existing.count = 1; // Сбрасываем счетчик для следующего окна

      return {
        shouldSend: true,
        repeatCount: suppressed + 1,
        suppressedCount: suppressed,
      };
    }

    // Внутри интервала троттлинга — блокируем спам
    return {
      shouldSend: false,
      repeatCount: existing.count,
      suppressedCount: existing.count - 1,
    };
  }

  /**
   * Очистка записей старше двойного интервала троттлинга
   */
  private cleanup(now: number): void {
    if (this.records.size > 500) {
      const expirationThreshold = now - this.throttleMs * 2;
      for (const [key, record] of this.records.entries()) {
        if (record.lastSentAt < expirationThreshold) {
          this.records.delete(key);
        }
      }
    }
  }

  /**
   * Сбросить историю для тестов
   */
  clear(): void {
    this.records.clear();
  }
}
