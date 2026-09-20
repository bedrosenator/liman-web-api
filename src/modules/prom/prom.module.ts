import { Module, forwardRef } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';
import { BackupModule } from '../backup/backup.module';
import { AppQueueModule } from '../queue/queue.module';
import { PromApiClient } from './prom-api.client';
import { PromFeedService } from './prom-feed.service';
import { PromFeedController } from './prom-feed.controller';
import { PromWebhookController } from './prom-webhook.controller';
import { PromSyncController } from './prom-sync.controller';
import { PromSyncService } from './prom-sync.service';
import { PromSchedulerService } from './prom-scheduler.service';
import { PromImportProcessor } from './prom-import.processor';
import { PromExportProcessor } from './prom-export.processor';

@Module({
  imports: [
    TenantModule,
    LimanModule,
    BackupModule,
    forwardRef(() => AppQueueModule),
  ],
  controllers: [
    PromFeedController,
    PromWebhookController,
    PromSyncController,
  ],
  providers: [
    PromApiClient,
    PromFeedService,
    PromSyncService,
    PromSchedulerService,
    PromImportProcessor,
    PromExportProcessor,
  ],
  exports: [
    PromApiClient,
    PromFeedService,
    PromSyncService,
    PromSchedulerService,
    PromImportProcessor,
    PromExportProcessor,
  ],
})
export class PromModule {}
