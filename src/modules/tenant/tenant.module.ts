import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenantIntegration } from './tenant-integration.entity';
import { ProductMapping } from './product-mapping.entity';
import { TenantService } from './tenant.service';
import { ProductMappingService } from './product-mapping.service';
import { SqliteToPostgresMigrationService } from './migration/sqlite-to-postgres-migration.service';
import { TenantController } from './tenant.controller';
import { AdminTenantsController } from './admin-tenants.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantIntegration, ProductMapping]),
  ],
  controllers: [TenantController, AdminTenantsController],
  providers: [
    TenantService,
    ProductMappingService,
    SqliteToPostgresMigrationService,
  ],
  exports: [TenantService, ProductMappingService, TypeOrmModule],
})
export class TenantModule {}
