import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';
import { PromApiClient } from './prom-api.client';
import { PromFeedService } from './prom-feed.service';
import { PromFeedController } from './prom-feed.controller';
import { PromWebhookController } from './prom-webhook.controller';
import { PromSyncController } from './prom-sync.controller';

@Module({
  imports: [TenantModule, LimanModule],
  controllers: [PromFeedController, PromWebhookController, PromSyncController],
  providers: [PromApiClient, PromFeedService],
  exports: [PromApiClient, PromFeedService],
})
export class PromModule {}
