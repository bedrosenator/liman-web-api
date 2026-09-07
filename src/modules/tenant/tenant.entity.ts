import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string; // e.g. "columb"

  @Column({ type: 'varchar', length: 128 })
  name!: string; // e.g. "Columb Shop"

  @Column({ type: 'varchar', length: 255, default: '127.0.0.1' })
  dbHost!: string;

  @Column({ type: 'integer', default: 3306 })
  dbPort!: number;

  @Column({ type: 'varchar', length: 128 })
  dbName!: string; // e.g. "columbDB"

  @Column({ type: 'varchar', length: 128, default: 'root' })
  dbUser!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  dbPassword!: string;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  apiKey?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  promApiKey?: string | null;

  @Column({ type: 'boolean', default: false })
  promExportEnabled!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  woocommerceUrl?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  woocommerceConsumerKey?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  woocommerceConsumerSecret?: string | null;

  @Column({ type: 'boolean', default: false })
  woocommerceSyncEnabled!: boolean;

  @Column({ type: 'integer', default: 15 })
  woocommerceSyncIntervalMinutes!: number;

  // Rozetka Seller API credentials
  @Column({ type: 'varchar', length: 255, nullable: true })
  rozetkaClientId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rozetkaClientSecret?: string | null;

  @Column({ type: 'boolean', default: false })
  rozetkaExportEnabled!: boolean;

  // Horoshop (Cartum) API credentials
  @Column({ type: 'varchar', length: 255, nullable: true })
  horoshopDomain?: string | null; // e.g. "myshop.horoshop.ua" or "myshop.com.ua"

  @Column({ type: 'varchar', length: 255, nullable: true })
  horoshopLogin?: string | null; // API login from Horoshop admin

  @Column({ type: 'varchar', length: 255, nullable: true })
  horoshopPassword?: string | null; // API password from Horoshop admin

  @Column({ type: 'boolean', default: false })
  horoshopExportEnabled!: boolean;

  @Column({ type: 'integer', default: 15 })
  horoshopSyncIntervalMinutes!: number;

  @Column({ type: 'varchar', length: 16, default: 'cena2' })
  priceColumn!: string; // default cena2 (retail price)

  @Column({ type: 'varchar', length: 16, default: 'skl_k' })
  stockColumn!: string; // default skl_k (main warehouse stock)

  @Column({ type: 'integer', default: 15 })
  syncIntervalMinutes!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastSyncAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
