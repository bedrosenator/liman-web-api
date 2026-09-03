import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { TenantConnectionManager } from './tenant-connection-manager.service';
import { LimanService } from './liman.service';
import { LimanCatalogController } from './liman-catalog.controller';
import { LimanStockController } from './liman-stock.controller';

@Module({
  imports: [TenantModule],
  controllers: [LimanCatalogController, LimanStockController],
  providers: [TenantConnectionManager, LimanService],
  exports: [TenantConnectionManager, LimanService],
})
export class LimanModule {}
