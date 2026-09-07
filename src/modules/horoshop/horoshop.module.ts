import { Module } from '@nestjs/common';
import { HoroshopAuthService } from './horoshop-auth.service';
import { HoroshopApiClient } from './horoshop-api.client';
import { HoroshopFeedService } from './horoshop-feed.service';
import { HoroshopFeedController } from './horoshop-feed.controller';
import { HoroshopSyncService } from './horoshop-sync.service';
import { HoroshopSyncController } from './horoshop-sync.controller';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';

@Module({
  imports: [TenantModule, LimanModule],
  controllers: [HoroshopFeedController, HoroshopSyncController],
  providers: [
    HoroshopAuthService,
    HoroshopApiClient,
    HoroshopFeedService,
    HoroshopSyncService,
  ],
  exports: [
    HoroshopAuthService,
    HoroshopApiClient,
    HoroshopFeedService,
    HoroshopSyncService,
  ],
})
export class HoroshopModule {}
