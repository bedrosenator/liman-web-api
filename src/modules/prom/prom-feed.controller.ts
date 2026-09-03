import { Controller, Get, Param, Res, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { PromFeedService } from './prom-feed.service';
import { TenantService } from '../tenant/tenant.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Prom.ua')
@Controller('prom/:tenantId')
export class PromFeedController {
  constructor(
    private readonly promFeedService: PromFeedService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('feed.xml')
  @Public()
  @ApiOperation({
    summary: 'Потоковый YML / XML каталог товаров для Prom.ua',
    description:
      'Используется Prom.ua для регулярного импорта и обновления каталога, категорий, описаний и фото. Генерируется потоком без перегрузки памяти.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'XML файл фида Prom.ua' })
  async getFeed(
    @Param('tenantId') tenantId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const host = `${req.protocol}://${req.get('host')}`;
    return this.promFeedService.streamYmlFeed(tenant, host, res);
  }
}
