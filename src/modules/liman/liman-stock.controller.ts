import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { LimanService } from './liman.service';
import { TenantService } from '../tenant/tenant.service';
import { UpdateStockDto } from './dto/update-stock.dto';

@ApiTags('Liman Stock')
@Controller('liman/:tenantId/stock')
export class LimanStockController {
  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
  ) {}

  @Get(':tcod')
  @ApiOperation({ summary: 'Получить текущий остаток товара' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiParam({ name: 'tcod', example: 251 })
  async getStock(
    @Param('tenantId') tenantId: string,
    @Param('tcod', ParseIntPipe) tcod: number,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const product = await this.limanService.getProductByTcod(tenant, tcod);
    return {
      tcod: product.tcod,
      name: product.name,
      stock: product.stock,
      isAvailable: product.isAvailable,
      stockColumn: tenant.stockColumn,
    };
  }

  @Patch(':tcod')
  @ApiOperation({ summary: 'Обновить остаток товара в таблице name2ost' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiParam({ name: 'tcod', example: 251 })
  async updateStock(
    @Param('tenantId') tenantId: string,
    @Param('tcod', ParseIntPipe) tcod: number,
    @Body() updateStockDto: UpdateStockDto,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    return this.limanService.updateStock(tenant, tcod, updateStockDto.stock);
  }
}
