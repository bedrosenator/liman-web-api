import { Module, Global } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertThrottlerService } from './alert-throttler.service';
import { TelegramService } from './telegram.service';
import { WebhookService } from './webhook.service';
import { AlertController } from './alert.controller';

@Global()
@Module({
  controllers: [AlertController],
  providers: [
    AlertThrottlerService,
    TelegramService,
    WebhookService,
    AlertService,
  ],
  exports: [AlertService, AlertThrottlerService, TelegramService, WebhookService],
})
export class AlertModule {}
