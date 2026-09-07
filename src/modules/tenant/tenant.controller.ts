import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiSecurity } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './tenant.entity';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @ApiOperation({ summary: 'Получить список всех магазинов / клиентов' })
  @ApiResponse({
    status: 200,
    description: 'Список тенантов',
    type: [Tenant],
  })
  async findAll() {
    const tenants = await this.tenantService.findAll();
    return tenants.map((t) => this.tenantService.sanitizeTenant(t));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить информацию о клиенте по ID' })
  @ApiParam({ name: 'id', example: 'columb' })
  @ApiResponse({ status: 200, type: Tenant })
  @ApiResponse({ status: 404, description: 'Тенант не найден' })
  async findOne(@Param('id') id: string) {
    const tenant = await this.tenantService.findOne(id);
    return this.tenantService.sanitizeTenant(tenant);
  }

  @Post()
  @ApiOperation({ summary: 'Создать нового клиента / магазин' })
  @ApiResponse({ status: 201, type: Tenant })
  @ApiResponse({ status: 409, description: 'Тенант с таким ID уже существует' })
  async create(@Body() createTenantDto: CreateTenantDto) {
    const tenant = await this.tenantService.create(createTenantDto);
    return this.tenantService.sanitizeTenant(tenant);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить настройки клиента' })
  @ApiParam({ name: 'id', example: 'columb' })
  @ApiResponse({ status: 200, type: Tenant })
  async update(
    @Param('id') id: string,
    @Body() updateTenantDto: UpdateTenantDto,
  ) {
    const tenant = await this.tenantService.update(id, updateTenantDto);
    return this.tenantService.sanitizeTenant(tenant);
  }

  @Post(':id/rotate-key')
  @ApiOperation({
    summary: 'Сгенерировать новый API Key для клиента (ротация ключа)',
    description: 'Старый ключ инвалидируется немедленно. Используйте при утечке ключа.',
  })
  @ApiParam({ name: 'id', example: 'columb' })
  @ApiResponse({ status: 201, schema: { type: 'object', properties: { id: { type: 'string' }, apiKey: { type: 'string' } } } })
  rotateKey(@Param('id') id: string) {
    return this.tenantService.rotateApiKey(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить клиента' })
  @ApiParam({ name: 'id', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Тенант успешно удален' })
  remove(@Param('id') id: string) {
    return this.tenantService.remove(id);
  }
}
