import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TenantModule } from '../tenant/tenant.module';
import { LimanModule } from '../liman/liman.module';
import { WoocommerceApiClient } from './woocommerce-api.client';
import { WoocommerceSyncService } from './woocommerce-sync.service';
import { WoocommerceImportService } from './woocommerce-import.service';
import { WoocommerceController } from './woocommerce.controller';
import { QUEUE_NAMES } from '../queue/queue.constants';

@Module({
  imports: [
    TenantModule,
    LimanModule,
    BullModule.registerQueue({
      name: QUEUE_NAMES.IMPORT_WOO_CATALOG,
    }),
  ],
  controllers: [WoocommerceController],
  providers: [
    WoocommerceApiClient,
    WoocommerceSyncService,
    WoocommerceImportService,
  ],
  exports: [
    WoocommerceApiClient,
    WoocommerceSyncService,
    WoocommerceImportService,
  ],
})
export class WoocommerceModule {}
