import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';
import { WoocommerceApiClient } from './woocommerce-api.client';
import { WoocommerceSyncService } from './woocommerce-sync.service';
import { WoocommerceController } from './woocommerce.controller';

@Module({
  imports: [TenantModule, LimanModule],
  controllers: [WoocommerceController],
  providers: [WoocommerceApiClient, WoocommerceSyncService],
  exports: [WoocommerceApiClient, WoocommerceSyncService],
})
export class WoocommerceModule {}
