import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RozetkaFeedService } from './rozetka-feed.service';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('Rozetka')
@Controller('rozetka/:tenantId')
export class RozetkaFeedController {
  constructor(
    private readonly feedService: RozetkaFeedService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('feed.xml')
  @ApiOperation({
    summary: 'XML-фид каталога для Rozetka Marketplace',
    description:
      'Генерирует потоковый YML/XML файл совместимый с форматом фида Rozetka. ' +
      'Содержит все активные товары с ценами, остатками, описаниями и ссылками на изображения. ' +
      'Этот URL указывается в настройках Rozetka Seller Center → Каталог → XML фид.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'XML фид (application/xml)' })
  async getFeed(
    @Param('tenantId') tenantId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await this.feedService.streamFeed(tenant, baseUrl, res);
  }
}
