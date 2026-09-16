import { Module, forwardRef } from '@nestjs/common';
import { HoroshopAuthService } from './horoshop-auth.service';
import { HoroshopApiClient } from './horoshop-api.client';
import { HoroshopFeedService } from './horoshop-feed.service';
import { HoroshopFeedController } from './horoshop-feed.controller';
import { HoroshopSyncService } from './horoshop-sync.service';
import { HoroshopSyncController } from './horoshop-sync.controller';
import { HoroshopSchedulerService } from './horoshop-scheduler.service';
import { HoroshopImportProcessor } from './horoshop-import.processor';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';
import { BackupModule } from '../backup/backup.module';
import { AppQueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TenantModule,
    LimanModule,
    BackupModule,
    forwardRef(() => AppQueueModule),
  ],
  controllers: [HoroshopFeedController, HoroshopSyncController],
  providers: [
    HoroshopAuthService,
    HoroshopApiClient,
    HoroshopFeedService,
    HoroshopSyncService,
    HoroshopSchedulerService,
    HoroshopImportProcessor,
  ],
  exports: [
    HoroshopAuthService,
    HoroshopApiClient,
    HoroshopFeedService,
    HoroshopSyncService,
    HoroshopSchedulerService,
    HoroshopImportProcessor,
  ],
})
export class HoroshopModule {}

