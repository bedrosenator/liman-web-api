import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { LimanService } from './liman.service';
import { TenantService } from '../tenant/tenant.service';
import { LimanCategoryDto, LimanProductDto } from './dto/liman-product.dto';

@ApiTags('Liman Catalog')
@Controller('liman/:tenantId')
export class LimanCatalogController {
  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('ping')
  @ApiOperation({ summary: 'Проверка соединения с MariaDB конкретного магазина' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  async ping(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    return this.limanService.ping(tenant);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Получить дерево / список категорий из таблицы name' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, type: [LimanCategoryDto] })
  async getCategories(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.findOne(tenantId);
    return this.limanService.getCategories(tenant);
  }

  @Get('products')
  @ApiOperation({ summary: 'Получить список товаров с остатками и ценами (пагинация)' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'search', required: false, description: 'Поиск по названию или штрихкоду' })
  @ApiQuery({ name: 'categoryGroup', required: false, description: 'Фильтр по коду категории' })
  @ApiQuery({ name: 'onlyInStock', required: false, type: Boolean, description: 'Только в наличии' })
  async getProducts(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryGroup') categoryGroup?: string,
    @Query('onlyInStock') onlyInStock?: string,
    @Req() req?: Request,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const host = req ? `${req.protocol}://${req.get('host')}` : undefined;

    return this.limanService.getProducts(tenant, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search,
      categoryGroup,
      onlyInStock: onlyInStock === 'true' || onlyInStock === '1',
      baseUrl: host,
    });
  }

  @Get('products/:tcod')
  @ApiOperation({ summary: 'Получить детальную информацию о товаре по tcod' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiParam({ name: 'tcod', example: 251 })
  @ApiResponse({ status: 200, type: LimanProductDto })
  async getProductByTcod(
    @Param('tenantId') tenantId: string,
    @Param('tcod', ParseIntPipe) tcod: number,
    @Req() req?: Request,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const host = req ? `${req.protocol}://${req.get('host')}` : undefined;
    return this.limanService.getProductByTcod(tenant, tcod, host);
  }

  @Get('changes')
  @ApiOperation({ summary: 'Получить последние изменения из dmonitor' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async getChanges(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    return this.limanService.getRecentChanges(
      tenant,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
