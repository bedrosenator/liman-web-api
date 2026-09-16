import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { AdminTenantsController } from './admin-tenants.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantController, AdminTenantsController],
  providers: [TenantService],
  exports: [TenantService, TypeOrmModule],
})
export class TenantModule {}
