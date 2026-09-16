import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';
import { StockSyncProcessor } from './sync-queue.processor';
import { WooImportProcessor } from './woo-import.processor';
import { SyncService } from './sync.service';
import { SyncJobsController } from './sync-jobs.controller';
import { AdminQueuesController } from './admin-queues.controller';
import { LimanModule } from '../liman/liman.module';
import { TenantModule } from '../tenant/tenant.module';
import { PromModule } from '../prom/prom.module';
import { WoocommerceModule } from '../woocommerce/woocommerce.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password') || undefined,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.SYNC_STOCK },
      { name: QUEUE_NAMES.EXPORT_CATALOG },
      { name: QUEUE_NAMES.IMPORT_ORDERS },
      { name: QUEUE_NAMES.IMPORT_WOO_CATALOG },
    ),
    TenantModule,
    LimanModule,
    PromModule,
    WoocommerceModule,
  ],
  controllers: [SyncJobsController, AdminQueuesController],
  providers: [SyncService, StockSyncProcessor, WooImportProcessor],
  exports: [SyncService, BullModule],
})
export class AppQueueModule {}
