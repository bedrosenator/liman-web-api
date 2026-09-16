import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './tenant.entity';

@ApiTags('Admin / Tenants')
@Controller('admin/tenants')
export class AdminTenantsController {
  private readonly logger = new Logger('SecurityAudit');

  constructor(private readonly tenantService: TenantService) {}

  /**
   * Маскирует чувствительные данные тенанта для безопасного отображения в админке
   */
  maskTenant(tenant: Tenant): Tenant {
    const masked = { ...tenant };
    const MASK = '••••••••';
    if (masked.dbPassword) masked.dbPassword = MASK;
    if (masked.horoshopPassword) masked.horoshopPassword = MASK;
    if (masked.promApiKey) masked.promApiKey = MASK;
    if (masked.rozetkaClientSecret) masked.rozetkaClientSecret = MASK;
    if (masked.woocommerceConsumerSecret)
      masked.woocommerceConsumerSecret = MASK;
    if (masked.apiKey) masked.apiKey = MASK;
    return masked;
  }

  @Get()
  @ApiOperation({
    summary: 'Получить сводный список всех клиентов с маскированными паролями',
    description:
      'Все чувствительные данные маскируются строкой •••••••• для защиты от утечек.',
  })
  @ApiResponse({ status: 200, type: [Tenant] })
  async findAll(): Promise<Tenant[]> {
    const tenants = await this.tenantService.findAll();
    return tenants.map((t) => this.maskTenant(t));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить данные клиента с маскированными секретами' })
  @ApiParam({ name: 'id', example: 'columb' })
  @ApiResponse({ status: 200, type: Tenant })
  async findOne(@Param('id') id: string): Promise<Tenant> {
    const tenant = await this.tenantService.findOne(id);
    return this.maskTenant(tenant);
  }

  @Post(':id/reveal-credentials')
  @ApiOperation({
    summary: 'Раскрыть реальные учетные данные клиента (с фиксацией в аудит-логе)',
    description:
      'Возвращает не замаскированные пароли и ключи тенанта для уполномоченного супер-админа.',
  })
  @ApiParam({ name: 'id', example: 'columb' })
  @ApiResponse({ status: 200 })
  async revealCredentials(@Param('id') id: string) {
    const tenant = await this.tenantService.findOne(id);
    this.logger.warn(
      `[SECURITY AUDIT] 🚨 Супер-админ запросил раскрытие паролей и ключей для тенанта "${id}" в ${new Date().toISOString()}`,
    );
    return {
      id: tenant.id,
      dbPassword: tenant.dbPassword || '',
      horoshopPassword: tenant.horoshopPassword || '',
      promApiKey: tenant.promApiKey || '',
      rozetkaClientSecret: tenant.rozetkaClientSecret || '',
      woocommerceConsumerSecret: tenant.woocommerceConsumerSecret || '',
      apiKey: tenant.apiKey || '',
    };
  }

  @Post(':id/rotate-key')
  @ApiOperation({ summary: 'Ротация API-ключа клиента' })
  @ApiParam({ name: 'id', example: 'columb' })
  async rotateKey(@Param('id') id: string) {
    return this.tenantService.rotateApiKey(id);
  }

  @Post()
  @ApiOperation({ summary: 'Создать нового клиента' })
  @ApiResponse({ status: 201, type: Tenant })
  async create(@Body() createTenantDto: CreateTenantDto): Promise<Tenant> {
    const tenant = await this.tenantService.create(createTenantDto);
    return this.maskTenant(tenant);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить настройки клиента' })
  @ApiParam({ name: 'id', example: 'columb' })
  @ApiResponse({ status: 200, type: Tenant })
  async update(
    @Param('id') id: string,
    @Body() updateTenantDto: UpdateTenantDto,
  ): Promise<Tenant> {
    const tenant = await this.tenantService.update(id, updateTenantDto);
    return this.maskTenant(tenant);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить клиента из системы' })
  @ApiParam({ name: 'id', example: 'columb' })
  async remove(@Param('id') id: string) {
    return this.tenantService.remove(id);
  }
}
