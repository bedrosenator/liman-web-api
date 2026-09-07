import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { LimanService } from '../liman/liman.service';
import { Tenant } from '../tenant/tenant.entity';

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

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Потоковая отдача XML-фида для Rozetka
   * GET /api/v1/rozetka/:tenantId/feed.xml
   */
  async streamFeed(tenant: Tenant, baseUrl: string, res: Response): Promise<void> {
    this.logger.log(
      `📡 [${tenant.id}] Начало генерации Rozetka XML фида...`,
    );

    const dateStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const shopName = this.escapeXml(tenant.name);

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
        ? ` parentId="${this.escapeXml(cat.parent)}"`
        : '';
      res.write(
        `      <category id="${this.escapeXml(cat.group)}"${parentAttr}>${this.escapeXml(cat.name)}</category>\n`,
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
        const available = item.isAvailable ? 'true' : 'false';

        res.write(`      <offer id="${item.tcod}" available="${available}">\n`);
        res.write(`        <name>${this.escapeXml(item.name)}</name>\n`);

        // Цена обязательна — Rozetka отклоняет оферы с price=0
        const price = item.price > 0 ? item.price : 0.01;
        res.write(`        <price>${price.toFixed(2)}</price>\n`);
        res.write(`        <currencyId>UAH</currencyId>\n`);

        if (item.categoryGroup) {
          res.write(
            `        <categoryId>${this.escapeXml(item.categoryGroup)}</categoryId>\n`,
          );
        }

        // Артикул / SKU
        if (item.barcode) {
          res.write(
            `        <vendorCode>${this.escapeXml(item.barcode)}</vendorCode>\n`,
          );
        }

        // Картинки (Rozetka: до 10 изображений)
        if (item.imageUrls?.length) {
          for (const imgUrl of item.imageUrls.slice(0, 10)) {
            res.write(`        <picture>${this.escapeXml(imgUrl)}</picture>\n`);
          }
        }

        // Описание
        if (item.description) {
          res.write(
            `        <description><![CDATA[${item.description}]]></description>\n`,
          );
        }

        // Параметры
        res.write(
          `        <param name="Наявність">${item.isAvailable ? 'В наявності' : 'Немає в наявності'}</param>\n`,
        );
        res.write(
          `        <param name="Кількість">${Math.max(0, Math.floor(item.stock))}</param>\n`,
        );
        if (item.barcode) {
          res.write(
            `        <param name="Штрихкод">${this.escapeXml(item.barcode)}</param>\n`,
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
