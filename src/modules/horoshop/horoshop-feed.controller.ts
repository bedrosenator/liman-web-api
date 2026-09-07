import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { HoroshopFeedService } from './horoshop-feed.service';
import { TenantService } from '../tenant/tenant.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Horoshop')
@Controller('horoshop/:tenantId')
export class HoroshopFeedController {
  constructor(
    private readonly feedService: HoroshopFeedService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('feed.xml')
  @Public()
  @ApiOperation({
    summary: 'Потоковый XML/YML фид каталога для магазина на платформе Хорошоп',
    description:
      'Генерирует потоковый XML файл в формате YML, совместимый с авто-импортом каталога платформы Хорошоп. ' +
      'Содержит товары, категории, актуальные цены, остатки и ссылки на изображения. ' +
      'Этот URL указывается в админ-панели Хорошоп в настройках регулярного импорта фида.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'XML фид каталога (application/xml)' })
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
