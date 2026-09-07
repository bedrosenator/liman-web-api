import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';
import { RozetkaAuthService } from './rozetka-auth.service';
import { RozetkaApiClient } from './rozetka-api.client';
import { RozetkaFeedService } from './rozetka-feed.service';
import { RozetkaSyncService } from './rozetka-sync.service';
import { RozetkaFeedController } from './rozetka-feed.controller';
import { RozetkaSyncController } from './rozetka-sync.controller';

@Module({
  imports: [TenantModule, LimanModule],
  controllers: [RozetkaFeedController, RozetkaSyncController],
  providers: [
    RozetkaAuthService,
    RozetkaApiClient,
    RozetkaFeedService,
    RozetkaSyncService,
  ],
  exports: [RozetkaApiClient, RozetkaFeedService, RozetkaSyncService],
})
export class RozetkaModule {}
