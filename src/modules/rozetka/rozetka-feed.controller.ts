import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { RozetkaFeedService } from './rozetka-feed.service';
import { TenantService } from '../tenant/tenant.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Rozetka')
@Controller('rozetka/:tenantId')
export class RozetkaFeedController {
  constructor(
    private readonly feedService: RozetkaFeedService,
    private readonly tenantService: TenantService,
    private readonly configService: ConfigService,
  ) {}

  @Get('feed.xml')
  @Public()
  @ApiOperation({
    summary: 'XML-фид каталога для Rozetka Marketplace',
    description:
      'Генерирует потоковый YML/XML файл совместимый с форматом фида Rozetka. ' +
      'Содержит все активные товары с ценами, остатками, описаниями и ссылками на изображения. ' +
      'Этот URL указывается в настройках Rozetka Seller Center → Каталог → XML фид.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiQuery({
    name: 'baseUrl',
    required: false,
    description: 'Кастомный публичный URL для ссылок на картинки (например, https://my-domain.com)',
  })
  @ApiResponse({ status: 200, description: 'XML фид (application/xml)' })
  async getFeed(
    @Param('tenantId') tenantId: string,
    @Query('baseUrl') queryBaseUrl: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const baseUrl =
      queryBaseUrl ??
      this.configService.get<string>('publicBaseUrl') ??
      `${req.protocol}://${req.get('host')}`;
    await this.feedService.streamFeed(tenant, baseUrl, res);
  }
}

