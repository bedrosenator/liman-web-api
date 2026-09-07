import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';
import { RozetkaAuthService } from './rozetka-auth.service';
import { RozetkaApiClient } from './rozetka-api.client';
import { RozetkaFeedService } from './rozetka-feed.service';
import { RozetzkasSyncService } from './rozetka-sync.service';
import { RozetkaFeedController } from './rozetka-feed.controller';
import { RozetzkasSyncController } from './rozetka-sync.controller';

@Module({
  imports: [TenantModule, LimanModule],
  controllers: [RozetkaFeedController, RozetzkasSyncController],
  providers: [
    RozetkaAuthService,
    RozetkaApiClient,
    RozetkaFeedService,
    RozetzkasSyncService,
  ],
  exports: [RozetkaApiClient, RozetkaFeedService, RozetzkasSyncService],
})
export class RozetkaModule {}
