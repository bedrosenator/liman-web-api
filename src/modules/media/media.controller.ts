import {
  Controller,
  Get,
  Param,
  Res,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import crypto from 'node:crypto';
import { LimanService } from '../liman/liman.service';
import { TenantService } from '../tenant/tenant.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Контроллер потоковой отдачи изображений товаров из бинарного хранилища Limansoft.
 *
 * Преобразует LONGBLOB данные из таблицы `namedesc` в стандартные HTTP URL,
 * необходимые для импорта в WooCommerce, Prom.ua, Rozetka и Хорошоп.
 *
 * Особенности:
 * 1. `@Public()` — доступен без API-ключа (чтобы внешние маркетплейсы и CDN могли скачивать фото).
 * 2. `ETag` + `HTTP 304 Not Modified` — предотвращает повторную передачу неизмененных картинок.
 * 3. SVG-плейсхолдер — при отсутствии фото отдает легкий векторный заглушечный баннер вместо ошибки 404.
 */
@ApiTags('Media')
@Controller('media/:tenantId/products/:tcod')
export class MediaController {
  constructor(
    private readonly limanService: LimanService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Стриминг фотографии товара по артикулу (tcod) и порядковому номеру
   *
   * @param tenantId Идентификатор магазина/клиента
   * @param tcod Числовой артикул товара в Limansoft
   * @param photoIndex Номер фотографии (1..5)
   * @param req Входящий запрос (для проверки заголовка If-None-Match)
   * @param res Исходящий HTTP-ответ
   */
  @Get(':photoIndex.jpg')
  @Public()
  @ApiOperation({
    summary: 'Получить изображение товара из BLOB таблицы namedesc по HTTP URL',
    description:
      'Используется внешними маркетплейсами (Prom.ua, Rozetka, WooCommerce) для импорта фото. Поддерживает ETag и HTTP 304 Not Modified.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiParam({ name: 'tcod', example: 251 })
  @ApiParam({ name: 'photoIndex', example: 1, description: 'Номер фото от 1 до 5' })
  @ApiResponse({ status: 200, description: 'Бинарное изображение (JPEG / PNG / WEBP)' })
  @ApiResponse({ status: 304, description: 'Не изменялось (ETag match)' })
  async getProductPhoto(
    @Param('tenantId') tenantId: string,
    @Param('tcod', ParseIntPipe) tcod: number,
    @Param('photoIndex', ParseIntPipe) photoIndex: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantService.findOne(tenantId);
    const result = await this.limanService.getProductImage(
      tenant,
      tcod,
      photoIndex,
    );

    if (!result || !result.data || result.data.length === 0) {
      // Отдать SVG заглушку "No Image"
      const svgPlaceholder = `
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
          <rect width="400" height="400" fill="#f1f5f9"/>
          <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" fill="#64748b">
            Liman Web API
          </text>
          <text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#94a3b8">
            Нет фото (tcod: ${tcod})
          </text>
        </svg>
      `.trim();

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(Buffer.from(svgPlaceholder));
    }

    // Рассчитываем ETag
    const hash = crypto
      .createHash('md5')
      .update(result.data)
      .digest('hex');
    const etag = `"${hash}"`;

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Length', result.data.length.toString());

    return res.status(200).end(result.data);
  }
}
