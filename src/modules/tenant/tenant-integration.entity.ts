import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { ProductMapping } from './product-mapping.entity';

export type IntegrationPlatform =
  | 'horoshop'
  | 'rozetka'
  | 'prom'
  | 'woocommerce'
  | 'custom';

@Entity('tenant_integrations')
@Index(['tenantId', 'platform'])
export class TenantIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  tenantId!: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.integrations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenantId' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 32 })
  platform!: IntegrationPlatform;

  @Column({ type: 'varchar', length: 128 })
  name!: string; // e.g. "Columb Shop (Хорошоп Розница)"

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: true })
  syncEnabled!: boolean;

  /**
   * Platform-specific credentials & config (e.g. domain, login, password, apiKey, webhooks)
   */
  @Column({ type: 'simple-json', nullable: true })
  credentials!: Record<string, any>;

  /**
   * Platform-specific settings (e.g. priceColumn, stockColumn, syncIntervalMinutes)
   */
  @Column({ type: 'simple-json', nullable: true })
  settings!: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt?: Date | null;

  @OneToMany(() => ProductMapping, (mapping) => mapping.integration)
  productMappings?: ProductMapping[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
