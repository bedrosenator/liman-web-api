import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';
import { MediaController } from './media.controller';

@Module({
  imports: [TenantModule, LimanModule],
  controllers: [MediaController],
})
export class MediaModule {}
