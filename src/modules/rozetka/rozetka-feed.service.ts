import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { LimanService } from '../liman/liman.service';
import { Tenant } from '../tenant/tenant.entity';
import { escapeXml, wrapCdata, formatYmlDate } from '../../common/utils/xml.utils';

/**
 * Сервис генерации XML-фида для Rozetka Marketplace
 *
 * Формат фида Rozetka совместим с YML (Yandex Market Language),
 * но имеет ряд специфических требований:
 *  - Поле наличия передаётся через атрибут available="true|false"
 *  - Остаток передаётся через <param name="Кількість"> (необязательно)
 *  - Штрихкод через <param name="Штрихкод">
 *  - Артикул через <vendorCode>
 */
@Injectable()
export class RozetkaFeedService {
  private readonly logger = new Logger(RozetkaFeedService.name);

  constructor(private readonly limanService: LimanService) {}

  /**
   * Потоковая отдача XML-фида для Rozetka
   * GET /api/v1/rozetka/:tenantId/feed.xml
   */
  async streamFeed(tenant: Tenant, baseUrl: string, res: Response): Promise<void> {
    this.logger.log(
      `📡 [${tenant.id}] Начало генерации Rozetka XML фида...`,
    );

    const dateStr = formatYmlDate();
    const shopName = escapeXml(tenant.name);

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="rozetka_feed_${tenant.id}.xml"`,
    );

    // ---- XML header ----
    res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
    res.write('<!DOCTYPE yml_catalog SYSTEM "shops.dtd">\n');
    res.write(`<yml_catalog date="${dateStr}">\n`);
    res.write('  <shop>\n');
    res.write(`    <name>${shopName}</name>\n`);
    res.write(`    <company>${shopName}</company>\n`);
    res.write(`    <url>${baseUrl}</url>\n`);
    res.write('    <currencies>\n');
    res.write('      <currency id="UAH" rate="1"/>\n');
    res.write('    </currencies>\n');

    // ---- Categories ----
    const categories = await this.limanService.getCategories(tenant);
    res.write('    <categories>\n');
    for (const cat of categories) {
      const parentAttr = cat.parent
        ? ` parentId="${escapeXml(cat.parent)}"`
        : '';
      res.write(
        `      <category id="${escapeXml(cat.group)}"${parentAttr}>${escapeXml(cat.name)}</category>\n`,
      );
    }
    res.write('    </categories>\n');

    // ---- Offers ----
    res.write('    <offers>\n');

    const CHUNK = 200;
    let page = 1;
    let hasMore = true;
    let totalExported = 0;

    while (hasMore) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: CHUNK,
        baseUrl,
      });

      if (!items.length) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        // Rozetka отклоняет оферы с price <= 0
        if (!item.price || item.price <= 0) {
          continue;
        }

        const available = item.isAvailable ? 'true' : 'false';
        const stockQty = Math.max(0, Math.floor(item.stock));

        res.write(`      <offer id="${item.tcod}" available="${available}">\n`);
        res.write(`        <name>${escapeXml(item.name)}</name>\n`);
        res.write(`        <price>${item.price.toFixed(2)}</price>\n`);
        res.write(`        <currencyId>UAH</currencyId>\n`);

        if (item.categoryGroup) {
          res.write(
            `        <categoryId>${escapeXml(item.categoryGroup)}</categoryId>\n`,
          );
        }

        // Производитель (обязательный тег для Rozetka)
        res.write(`        <vendor>${shopName}</vendor>\n`);

        // Артикул / SKU
        if (item.barcode) {
          res.write(
            `        <vendorCode>${escapeXml(item.barcode)}</vendorCode>\n`,
          );
        }

        // Остаток на складе (обязательный тег для Rozetka)
        res.write(`        <stock_quantity>${stockQty}</stock_quantity>\n`);

        // Картинки (обязательный тег для Rozetka, до 10 изображений)
        if (item.imageUrls?.length) {
          for (const imgUrl of item.imageUrls.slice(0, 10)) {
            res.write(`        <picture>${escapeXml(imgUrl)}</picture>\n`);
          }
        } else {
          // Если фото нет в базе, отдаем ссылку на медиа-эндпоинт
          res.write(
            `        <picture>${baseUrl}/api/v1/media/${tenant.id}/products/${item.tcod}/1.jpg</picture>\n`,
          );
        }

        // Описание
        if (item.description) {
          res.write(
            `        <description>${wrapCdata(item.description)}</description>\n`,
          );
        }

        // Дополнительные параметры
        res.write(
          `        <param name="Наявність">${item.isAvailable ? 'В наявності' : 'Немає в наявності'}</param>\n`,
        );
        res.write(
          `        <param name="Кількість">${stockQty}</param>\n`,
        );
        if (item.barcode) {
          res.write(
            `        <param name="Штрихкод">${escapeXml(item.barcode)}</param>\n`,
          );
        }

        res.write('      </offer>\n');
      }

      totalExported += items.length;
      page++;
      if (items.length < CHUNK) {
        hasMore = false;
      }
    }

    res.write('    </offers>\n');
    res.write('  </shop>\n');
    res.write('</yml_catalog>\n');

    this.logger.log(
      `✅ [${tenant.id}] Rozetka XML фид отправлен. Товаров: ${totalExported}`,
    );
    res.end();
  }
}
