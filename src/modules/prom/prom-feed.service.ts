import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { LimanService } from '../liman/liman.service';
import { Tenant } from '../tenant/tenant.entity';
import { escapeXml, wrapCdata, formatYmlDate } from '../../common/utils/xml.utils';

/**
 * Потоковый сервис генерации YML (Yandex Market Language) XML фида для Prom.ua.
 *
 * Архитектурные особенности:
 * 1. Потоковая запись (Streaming): данные отправляются чанками по 200 товаров напрямую в `res.write()`,
 *    что позволяет генерировать фид на 10 000+ товаров без накопления гигабайтов XML в оперативной памяти (O(1) RAM).
 * 2. CDATA-секции: описания товаров экранируются с сохранением HTML-разметки для Prom.ua.
 * 3. Полная иерархия: категории выгружаются с сохранением атрибутов `parentId` из таблицы `name`.
 */
@Injectable()
export class PromFeedService {
  private readonly logger = new Logger(PromFeedService.name);

  constructor(private readonly limanService: LimanService) {}

  /**
   * Потоковая генерация и отдача YML XML фида в HTTP-ответ для маркетплейса Prom.ua
   * @param tenant Модель клиента
   * @param baseUrl Базовый URL сервиса для ссылок на фото товаров
   * @param res Исходящий поток Express Response
   */
  async streamYmlFeed(tenant: Tenant, baseUrl: string, res: Response): Promise<void> {
    this.logger.log(`📡 Начало потоковой генерации Prom YML фида для "${tenant.id}"...`);
    const dateStr = formatYmlDate();

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="prom_feed_${tenant.id}.xml"`);

    // Заголовок YML
    res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
    res.write('<!DOCTYPE yml_catalog SYSTEM "shops.dtd">\n');
    res.write(`<yml_catalog date="${dateStr}">\n`);
    res.write('  <shop>\n');
    res.write(`    <name>${escapeXml(tenant.name)}</name>\n`);
    res.write(`    <company>${escapeXml(tenant.name)}</company>\n`);
    res.write(`    <url>${baseUrl}</url>\n`);
    res.write('    <currencies>\n');
    res.write('      <currency id="UAH" rate="1"/>\n');
    res.write('    </currencies>\n');

    // 1. Стриминг категорий
    const categories = await this.limanService.getCategories(tenant);
    res.write('    <categories>\n');
    for (const cat of categories) {
      const parentAttr = cat.parent ? ` parentId="${escapeXml(cat.parent)}"` : '';
      res.write(`      <category id="${escapeXml(cat.group)}"${parentAttr}>${escapeXml(cat.name)}</category>\n`);
    }
    res.write('    </categories>\n');

    // 2. Стриминг товаров порциями по 200 штук
    res.write('    <offers>\n');
    const chunkSize = 200;
    let page = 1;
    let hasMore = true;
    let totalExported = 0;

    while (hasMore) {
      const { items } = await this.limanService.getProducts(tenant, {
        page,
        limit: chunkSize,
        baseUrl,
      });

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        const availableAttr = item.isAvailable ? 'true' : 'false';
        res.write(`      <offer id="${item.tcod}" available="${availableAttr}">\n`);
        res.write(`        <name>${escapeXml(item.name)}</name>\n`);
        res.write(`        <price>${item.price.toFixed(2)}</price>\n`);
        res.write(`        <currencyId>UAH</currencyId>\n`);
        if (item.categoryGroup) {
          res.write(`        <categoryId>${escapeXml(item.categoryGroup)}</categoryId>\n`);
        }
        if (item.barcode) {
          res.write(`        <barcode>${escapeXml(item.barcode)}</barcode>\n`);
        }
        res.write(`        <quantity_in_stock>${item.stock}</quantity_in_stock>\n`);

        // Картинки
        if (item.imageUrls && item.imageUrls.length > 0) {
          for (const imgUrl of item.imageUrls) {
            res.write(`        <picture>${escapeXml(imgUrl)}</picture>\n`);
          }
        }

        // Описание
        if (item.description) {
          res.write(`        <description>${wrapCdata(item.description)}</description>\n`);
        }

        res.write('      </offer>\n');
      }

      totalExported += items.length;
      page++;
      if (items.length < chunkSize) {
        hasMore = false;
      }
    }

    res.write('    </offers>\n');
    res.write('  </shop>\n');
    res.write('</yml_catalog>\n');

    this.logger.log(`✅ Prom YML фид успешно отправлен! Экспортировано товаров: ${totalExported}`);
    res.end();
  }
}
