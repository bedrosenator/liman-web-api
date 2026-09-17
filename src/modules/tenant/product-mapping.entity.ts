import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { TenantIntegration } from './tenant-integration.entity';

export type MappingSyncStatus = 'synced' | 'pending' | 'error' | 'ignored';

@Entity('product_mappings')
@Unique(['integrationId', 'limanTcod'])
@Unique(['integrationId', 'externalArticle'])
@Index(['tenantId', 'limanTcod'])
@Index(['tenantId', 'externalArticle'])
export class ProductMapping {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  tenantId!: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.productMappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenantId' })
  tenant?: Tenant;

  @Column({ type: 'uuid' })
  integrationId!: string;

  @ManyToOne(
    () => TenantIntegration,
    (integration) => integration.productMappings,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'integrationId' })
  integration?: TenantIntegration;

  @Column({ type: 'integer' })
  limanTcod!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  limanBarcode?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  limanArticul?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  externalId?: string | null;

  @Column({ type: 'varchar', length: 128 })
  externalArticle!: string; // SKU or article in external store

  @Column({ type: 'varchar', length: 32, default: 'synced' })
  syncStatus!: MappingSyncStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  lastSyncError?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
