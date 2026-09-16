import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { PromApiClient } from './prom-api.client';
import { TenantService } from '../tenant/tenant.service';
import { LimanService } from '../liman/liman.service';

@ApiTags('Prom.ua')
@Controller('prom/:tenantId')
export class PromSyncController {
  private readonly logger = new Logger(PromSyncController.name);

  constructor(
    private readonly promApiClient: PromApiClient,
    private readonly tenantService: TenantService,
    private readonly limanService: LimanService,
  ) {}

  private async getPromToken(tenantId: string): Promise<string> {
    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.promApiKey) {
      throw new BadRequestException(
        `Prom API Token не задан для тенанта "${tenantId}". Укажите promApiKey в настройках клиента (в БД).`,
      );
    }
    return tenant.promApiKey;
  }

  @Get('ping')
  @ApiOperation({
    summary: 'Проверить подключение к Prom.ua API по токену магазина',
    description:
      'Выполняет тестовый запрос к Prom.ua API и возвращает статус подключения и базовые счетчики.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Подключение к Prom.ua успешно' })
  async ping(@Param('tenantId') tenantId: string) {
    const token = await this.getPromToken(tenantId);
    const result = await this.promApiClient.ping(token);
    return {
      tenantId,
      ...result,
    };
  }

  @Get('products')
  @ApiOperation({
    summary: 'Получить список товаров из магазина Prom.ua',
    description:
      'Возвращает текущие товары из каталога Prom.ua для верификации соответствия.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'last_id', required: false })
  @ApiQuery({ name: 'group_id', required: false })
  async getProducts(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('last_id') lastId?: string,
    @Query('group_id') groupId?: string,
  ) {
    const token = await this.getPromToken(tenantId);
    const products = await this.promApiClient.getProducts(token, {
      limit: limit ? parseInt(limit, 10) : 20,
      last_id: lastId ? parseInt(lastId, 10) : undefined,
      group_id: groupId ? parseInt(groupId, 10) : undefined,
    });
    return {
      tenantId,
      count: products.length,
      products,
    };
  }

  @Get('orders')
  @ApiOperation({
    summary: 'Получить список заказов из Prom.ua',
    description: 'Возвращает заказы из Prom.ua для отслеживания и сверки.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'status', required: false, example: 'pending' })
  async getOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
  ) {
    const token = await this.getPromToken(tenantId);
    const orders = await this.promApiClient.getOrders(token, status);
    return {
      tenantId,
      count: orders.length,
      orders,
    };
  }

  @Post('products/edit-by-prom-id')
  @ApiOperation({
    summary: 'Прямое обновление товаров в Prom.ua по внутреннему Prom ID',
    description:
      'Позволяет точечно обновить цены, остатки или статус товара напрямую по Prom ID.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 3195399849 },
          price: { type: 'number', example: 166.67 },
          quantity_in_stock: { type: 'number', example: 259 },
          presence: { type: 'string', example: 'available' },
        },
        required: ['id'],
      },
    },
  })
  async editByPromId(
    @Param('tenantId') tenantId: string,
    @Body()
    body: Array<{
      id: number;
      price?: number;
      presence?: 'available' | 'not_available' | 'order';
      quantity_in_stock?: number;
      name?: string;
    }>,
  ) {
    const token = await this.getPromToken(tenantId);
    return this.promApiClient.editProductsById(token, body);
  }
}
