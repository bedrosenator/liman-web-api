import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantService implements OnModuleInit {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultTenant();
  }

  private async seedDefaultTenant() {
    const existing = await this.tenantRepository.findOne({
      where: { id: 'columb' },
    });
    if (!existing) {
      this.logger.log('🌱 Инициализация дефолтного тенанта "columb"...');
      const columb = this.tenantRepository.create({
        id: 'columb',
        name: 'Columb Shop (Локальная MariaDB)',
        dbHost: process.env.DEV_LIMAN_DB_HOST ?? '127.0.0.1',
        dbPort: parseInt(process.env.DEV_LIMAN_DB_PORT ?? '3306', 10),
        dbName: process.env.DEV_LIMAN_DB_NAME ?? 'columbDB',
        dbUser: process.env.DEV_LIMAN_DB_USER ?? 'root',
        dbPassword: process.env.DEV_LIMAN_DB_PASSWORD ?? 'rootpassword',
        priceColumn: 'cena2',
        stockColumn: 'skl_k',
        syncIntervalMinutes: 15,
        isActive: true,
        apiKey: crypto.randomUUID(),
      });
      await this.tenantRepository.save(columb);
      this.logger.log('✅ Дефолтный тенант "columb" создан успешно');
    }
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Тенант с ID "${id}" не найден`);
    }
    return tenant;
  }

  async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
    const existing = await this.tenantRepository.findOne({
      where: { id: createTenantDto.id },
    });
    if (existing) {
      throw new ConflictException(
        `Тенант с ID "${createTenantDto.id}" уже существует`,
      );
    }
    const tenant = this.tenantRepository.create({
      ...createTenantDto,
      apiKey: createTenantDto.apiKey ?? crypto.randomUUID(),
    });
    return this.tenantRepository.save(tenant);
  }

  async rotateApiKey(id: string): Promise<{ id: string; apiKey: string }> {
    const tenant = await this.findOne(id);
    const newKey = crypto.randomUUID();
    tenant.apiKey = newKey;
    await this.tenantRepository.save(tenant);
    this.logger.log(`🔑 API ключ для тенанта "${id}" успешно обновлён`);
    return { id, apiKey: newKey };
  }

  async update(id: string, updateTenantDto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);
    Object.assign(tenant, updateTenantDto);
    return this.tenantRepository.save(tenant);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const tenant = await this.findOne(id);
    await this.tenantRepository.remove(tenant);
    return { success: true };
  }
}
