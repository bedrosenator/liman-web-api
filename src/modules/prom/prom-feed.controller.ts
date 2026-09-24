import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { PromFeedService } from './prom-feed.service';
import { PromApiClient } from './prom-api.client';
import { PromSyncService } from './prom-sync.service';
import { TenantService } from '../tenant/tenant.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Prom.ua')
@Controller('prom/:tenantId')
export class PromFeedController {
  constructor(
    private readonly promFeedService: PromFeedService,
    private readonly promApiClient: PromApiClient,
    private readonly promSyncService: PromSyncService,
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

  @Post('feed/send')
  @ApiOperation({
    summary: 'Отправить ссылку на YML-фид в Prom.ua API для запуска импорта и создания товаров',
    description:
      'Вызывает POST /products/import_url в Prom.ua API. Prom.ua ставит фид в очередь на парсинг и создание новых товаров.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Результат отправки команды импорта в Prom.ua API' })
  async sendFeed(
    @Param('tenantId') tenantId: string,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    if (!tenant.promApiKey) {
      throw new BadRequestException('Prom API Token не задан в настройках клиента');
    }

    const host = `${req.protocol}://${req.get('host')}`;
    const feedUrl = `${host}/api/v1/prom/${tenant.id}/feed.xml`;

    try {
      const result = await this.promApiClient.importUrl(tenant.promApiKey, {
        url: feedUrl,
        force_update: true,
        only_update: false,
        updated_fields: [
          'name',
          'sku',
          'price',
          'images_urls',
          'presence',
          'quantity_in_stock',
          'description',
          'group',
        ],
      });

      this.promSyncService.addActivity(tenantId, {
        type: 'sync',
        status: 'success',
        titleRu: 'Импорт фида отправлен в Prom.ua',
        titleUk: 'Імпорт фіда відправлено в Prom.ua',
        detailsRu: `Ссылка на фид успешно отправлена в Prom.ua API (ID задачи: ${result.id || 'N/A'}). Новые товары поставлены в очередь на создание.`,
        detailsUk: `Посилання на фід успішно відправлено в Prom.ua API (ID задачі: ${result.id || 'N/A'}). Нові товари поставлено в чергу на створення.`,
      });

      return {
        success: true,
        importId: result.id,
        message: `Ссылка на фид отправлена в Prom.ua (ID: ${result.id || 'N/A'}). Prom.ua начал создание и обновление товаров.`,
      };
    } catch (err: any) {
      const rawError =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Неизвестная ошибка Prom API';

      this.promSyncService.addActivity(tenantId, {
        type: 'sync',
        status: 'warning',
        titleRu: 'Prom.ua отклонил запуск импорта фида',
        titleUk: 'Prom.ua відхилив запуск імпорту фіда',
        detailsRu: `Ошибка Prom API: ${rawError}`,
        detailsUk: `Помилка Prom API: ${rawError}`,
      });

      return {
        success: false,
        error: rawError,
        message: rawError,
      };
    }
  }
}
