import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { LimanService } from '../liman/liman.service';
import { Tenant } from '../tenant/tenant.entity';

/**
 * Сервис генерации потокового XML/YML фида для магазина на платформе Хорошоп
 */
@Injectable()
export class HoroshopFeedService {
  private readonly logger = new Logger(HoroshopFeedService.name);

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
   * Потоковая отдача XML-фида для Хорошоп
   * GET /api/v1/horoshop/:tenantId/feed.xml
   */
  async streamFeed(tenant: Tenant, baseUrl: string, res: Response): Promise<void> {
    this.logger.log(`📡 [${tenant.id}] Начало генерации Хорошоп XML фида...`);

    const dateStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const shopName = this.escapeXml(tenant.name);

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
      const parentAttr = cat.parent ? ` parentId="${this.escapeXml(cat.parent)}"` : '';
      res.write(
        `      <category id="${this.escapeXml(cat.group)}"${parentAttr}>${this.escapeXml(cat.name)}</category>\n`,
      );
    }
    res.write('    </categories>\n');

    // ---- Offers ----
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
        res.write(`        <name>${this.escapeXml(product.name)}</name>\n`);
        res.write(`        <price>${price.toFixed(2)}</price>\n`);
        res.write('        <currencyId>UAH</currencyId>\n');

        if (product.categoryGroup) {
          res.write(`        <categoryId>${this.escapeXml(product.categoryGroup)}</categoryId>\n`);
        }

        res.write(`        <picture>${this.escapeXml(photoUrl)}</picture>\n`);
        res.write(`        <vendorCode>${product.tcod}</vendorCode>\n`);
        res.write(`        <article>${product.tcod}</article>\n`);
        res.write(`        <stock_quantity>${Math.max(0, Math.floor(product.stock))}</stock_quantity>\n`);

        if (product.barcode) {
          res.write(`        <barcode>${this.escapeXml(product.barcode)}</barcode>\n`);
        }

        const desc = product.description || product.name;
        res.write(`        <description><![CDATA[${desc}]]></description>\n`);
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
