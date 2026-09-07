import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { LimanService } from '../liman/liman.service';
import { Tenant } from '../tenant/tenant.entity';
import { escapeXml, wrapCdata, formatYmlDate } from '../../common/utils/xml.utils';

/**
 * Сервис генерации потокового XML/YML фида для магазина на платформе Хорошоп
 */
@Injectable()
export class HoroshopFeedService {
  private readonly logger = new Logger(HoroshopFeedService.name);

  constructor(private readonly limanService: LimanService) {}

  /**
   * Потоковая отдача XML-фида для Хорошоп
   * GET /api/v1/horoshop/:tenantId/feed.xml
   */
  async streamFeed(tenant: Tenant, baseUrl: string, res: Response): Promise<void> {
    this.logger.log(`📡 [${tenant.id}] Начало генерации Хорошоп XML фида...`);

    const dateStr = formatYmlDate();
    const shopName = escapeXml(tenant.name);

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="horoshop_feed_${tenant.id}.xml"`,
    );

    // ---- XML Header ----
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
      const parentAttr = cat.parent ? ` parentId="${escapeXml(cat.parent)}"` : '';
      res.write(
        `      <category id="${escapeXml(cat.group)}"${parentAttr}>${escapeXml(cat.name)}</category>\n`,
      );
    }
    res.write('    </categories>\n');

    // ---- Offers (товары чанками по 200) ----
    res.write('    <offers>\n');

    const chunkSize = 200;
    let page = 1;
    let totalExported = 0;

    while (true) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: chunkSize,
      });

      if (!items || items.length === 0) {
        break;
      }

      for (const product of items) {
        const available = product.isAvailable ? 'true' : 'false';
        const photoUrl =
          product.imageUrls && product.imageUrls.length > 0
            ? product.imageUrls[0]
            : `${baseUrl}/api/v1/media/${tenant.id}/products/${product.tcod}/0.jpg`;
        const price = product.price > 0 ? product.price : 0.01;

        res.write(`      <offer id="${product.tcod}" available="${available}">\n`);
        res.write(`        <name>${escapeXml(product.name)}</name>\n`);
        res.write(`        <price>${price.toFixed(2)}</price>\n`);
        res.write('        <currencyId>UAH</currencyId>\n');

        if (product.categoryGroup) {
          res.write(`        <categoryId>${escapeXml(product.categoryGroup)}</categoryId>\n`);
        }

        res.write(`        <picture>${escapeXml(photoUrl)}</picture>\n`);
        res.write(`        <vendorCode>${product.tcod}</vendorCode>\n`);
        res.write(`        <article>${product.tcod}</article>\n`);
        res.write(`        <stock_quantity>${Math.max(0, Math.floor(product.stock))}</stock_quantity>\n`);

        if (product.barcode) {
          res.write(`        <barcode>${escapeXml(product.barcode)}</barcode>\n`);
        }

        const desc = product.description || product.name;
        res.write(`        <description>${wrapCdata(desc)}</description>\n`);
        res.write('      </offer>\n');

        totalExported++;
      }

      if (items.length < chunkSize) {
        break;
      }

      page++;
    }

    res.write('    </offers>\n');
    res.write('  </shop>\n');
    res.write('</yml_catalog>\n');
    res.end();

    this.logger.log(
      `✅ [${tenant.id}] Хорошоп XML фид успешно сформирован. Выгружено товаров: ${totalExported}`,
    );
  }
}
