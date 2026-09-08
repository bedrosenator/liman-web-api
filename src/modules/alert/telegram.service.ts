import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AlertPayload } from './interfaces/alert.interface';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken?: string;
  private readonly chatId?: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.botToken = (
      this.configService.get<string>('alerts.telegramBotToken') ??
      this.configService.get<string>('TELEGRAM_BOT_TOKEN')
    )?.trim();
    this.chatId = (
      this.configService.get<string>('alerts.telegramChatId') ??
      this.configService.get<string>('TELEGRAM_CHAT_ID')
    )?.trim();

    this.isConfigured = Boolean(
      this.botToken &&
        this.chatId &&
        this.botToken !== 'mock' &&
        this.botToken !== 'YOUR_BOT_TOKEN',
    );

    if (!this.isConfigured) {
      this.logger.log(
        'ℹ️ Telegram Bot не сконфигурирован или работает в MOCK-режиме (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы). Сообщения будут выводиться в консоль.',
      );
    }
  }

  /**
   * Экранирование спецсимволов HTML для безопасной отправки в Telegram
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Форматирование сообщения алерта в HTML
   */
  formatMessage(payload: AlertPayload, suppressedCount = 0): string {
    const icon =
      payload.level === 'CRITICAL'
        ? '🚨'
        : payload.level === 'WARNING'
          ? '⚠️'
          : 'ℹ️';

    const tenantTag = payload.tenantId
      ? `<b>[Tenant: ${this.escapeHtml(payload.tenantId)}]</b> `
      : '<b>[System]</b> ';

    const timeStr = (payload.timestamp || new Date()).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    let html = `${icon} <b>[${payload.level}]</b> ${tenantTag}<b>${this.escapeHtml(payload.title)}</b>\n\n`;
    html += `🕒 <b>Время:</b> <code>${timeStr}</code>\n`;
    html += `📍 <b>Источник:</b> <code>${this.escapeHtml(payload.source)}</code>\n`;
    html += `📝 <b>Описание:</b> ${this.escapeHtml(payload.message)}\n`;

    if (payload.errorDetails) {
      // Обрезаем слишком длинные стектрейсы до 1000 символов
      const truncated =
        payload.errorDetails.length > 1000
          ? payload.errorDetails.slice(0, 1000) + '...'
          : payload.errorDetails;
      html += `\n🔍 <b>Детали ошибки:</b>\n<pre>${this.escapeHtml(truncated)}</pre>\n`;
    }

    if (suppressedCount > 0) {
      html += `\n🔁 <i>Внимание: ошибка повторилась ${suppressedCount} раз(а) за интервал троттлинга.</i>\n`;
    }

    return html;
  }

  /**
   * Отправка форматированного алерта в Telegram
   */
  async sendAlert(
    payload: AlertPayload,
    suppressedCount = 0,
  ): Promise<{ success: boolean; mocked?: boolean; error?: string }> {
    const message = this.formatMessage(payload, suppressedCount);

    if (!this.isConfigured) {
      this.logger.warn(
        `[MOCK TELEGRAM ALERT] (${payload.level}) -> [Chat: ${this.chatId || 'none'}]:\n${message}`,
      );
      return { success: true, mocked: true };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      await axios.post(
        url,
        {
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        },
        { timeout: 5000 },
      );

      this.logger.log(
        `📢 Алерт успешно доставлен в Telegram (${payload.level}: ${payload.title})`,
      );
      return { success: true };
    } catch (err: any) {
      const errorMsg = err.response?.data?.description || err.message;
      this.logger.error(`❌ Не удалось отправить алерт в Telegram: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}
