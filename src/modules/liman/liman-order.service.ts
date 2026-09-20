import { Injectable, Logger, Optional } from '@nestjs/common';
import mysql from 'mysql2/promise';
import { Tenant } from '../tenant/tenant.entity';
import { LimanService } from './liman.service';
import { TenantConnectionManager } from './tenant-connection-manager.service';
import { ProductMappingService } from '../tenant/product-mapping.service';
import { AlertService } from '../alert/alert.service';
import { UnifiedIncomingOrderDto } from './dto/unified-order.dto';

export interface ResolvedLineItem {
  externalArticle: string;
  tcod: number | null;
  name?: string;
  quantity: number;
  price: number;
  discount?: number;
  resolvedVia: 'product_mappings' | 'tcod_direct' | 'barcode' | 'nnom' | 'not_found';
}

export interface ProcessOrderResult {
  externalOrderId: string;
  source: string;
  mode: 'deduct_only' | 'create_document';
  resolvedItems: ResolvedLineItem[];
  deductedItems: Array<{
    tcod: number;
    qty: number;
    oldStock: number;
    newStock: number;
  }>;
  skippedArticles: string[];
  warnings: string[];
  success: boolean;
}

/**
 * Единый доменный сервис обработки входящих заказов Limansoft.
 *
 * Архитектурный паттерн: Anti-Corruption Layer + Domain Service.
 * Является единственной точкой входа для всех каналов заказов:
 * Хорошоп, WooCommerce, Prom.ua, Rozetka.
 *
 * Режим работы определяется флагом тенанта `horoshopCreateOrderDocumentEnabled`:
 * - false (по умолчанию): Режим 1 — атомарный декремент name2ost.skl_k.
 *   100% безопасен, не затрагивает кассовые/бухгалтерские таблицы.
 * - true (экспериментальный): Режим 2 — создание черновика накладной
 *   tip_dok:85 в таблицах nshap, nakltelo, ndok, checkdok, dmonitor.
 */
@Injectable()
export class LimanOrderService {
  private readonly logger = new Logger(LimanOrderService.name);

  // Кэш уже обработанных заказов: ключ «tenantId:source:orderId»
  // Предотвращает повторное списание при дублирующих webhook-вызовах
  private readonly processedOrderCache = new Set<string>();

  constructor(
    private readonly limanService: LimanService,
    private readonly connectionManager: TenantConnectionManager,
    @Optional() private readonly productMappingService?: ProductMappingService,
    @Optional() private readonly alertService?: AlertService,
  ) {}

  /**
   * Проверить, был ли заказ уже обработан (дедупликация).
   * @returns true — заказ новый, false — уже был обработан
   */
  markOrderProcessed(
    tenantId: string,
    source: string,
    externalOrderId: string,
  ): boolean {
    const key = `${tenantId}:${source}:${externalOrderId}`;
    if (this.processedOrderCache.has(key)) {
      return false;
    }
    this.processedOrderCache.add(key);
    // Ограничиваем размер кэша в памяти (храним последние 10000 заказов)
    if (this.processedOrderCache.size > 10_000) {
      const firstKey = this.processedOrderCache.values().next().value;
      if (firstKey) this.processedOrderCache.delete(firstKey);
    }
    return true;
  }

  /**
   * Универсальный резолвер товара: строковый артикул / tcod / штрихкод → числовой tcod Лимана.
   *
   * Алгоритм поиска (3 уровня, от быстрого к медленному):
   * 1. product_mappings (PostgreSQL): поиск по externalArticle (строковый артикул Хорошоп)
   * 2. LimanService.findProductBySkuOrBarcode (MariaDB): числовой tcod, nnom, strihcod
   * 3. Возврат null с предупреждением
   *
   * @param tenant       Модель тенанта
   * @param integrationId ID интеграции Хорошоп (для поиска в product_mappings)
   * @param externalArticle Строковый артикул из внешней системы
   */
  async resolveProductTcod(
    tenant: Tenant,
    integrationId: string | null,
    externalArticle: string,
  ): Promise<{ tcod: number | null; resolvedVia: ResolvedLineItem['resolvedVia'] }> {
    const article = String(externalArticle || '').trim();
    if (!article) {
      return { tcod: null, resolvedVia: 'not_found' };
    }

    // ── Уровень 1: product_mappings в PostgreSQL ──────────────────────────────
    // Хранит сопоставления: строковый артикул Хорошоп (ELE-23-0557) ↔ tcod Лимана
    if (integrationId && this.productMappingService) {
      try {
        const mapping = await this.productMappingService.getMappingByExternalArticle(
          integrationId,
          article,
        );
        if (mapping?.limanTcod) {
          this.logger.debug(
            `[${tenant.id}] resolveProductTcod: «${article}» → tcod=${mapping.limanTcod} (via product_mappings)`,
          );
          return { tcod: mapping.limanTcod, resolvedVia: 'product_mappings' };
        }
      } catch (err: any) {
        this.logger.warn(
          `[${tenant.id}] Ошибка поиска в product_mappings для «${article}»: ${err.message}`,
        );
      }
    }

    // ── Уровень 2: MariaDB — tcod напрямую / nnom / strihcod ─────────────────
    // findProductBySkuOrBarcode обрабатывает:
    //   - числовой tcod (строка «251» → findOne tcod=251)
    //   - nnom (основное поле штрихкода в name2)
    //   - strihcod (дополнительные штрихкоды)
    try {
      const found = await this.limanService.findProductBySkuOrBarcode(tenant, article);
      if (found?.tcod) {
        // Определяем путь резолва для логирования
        const isNumeric = /^\d+$/.test(article) && Number(article) === found.tcod;
        const resolvedVia: ResolvedLineItem['resolvedVia'] = isNumeric ? 'tcod_direct' : 'barcode';
        this.logger.debug(
          `[${tenant.id}] resolveProductTcod: «${article}» → tcod=${found.tcod} (via ${resolvedVia})`,
        );
        return { tcod: found.tcod, resolvedVia };
      }
    } catch (err: any) {
      this.logger.warn(
        `[${tenant.id}] Ошибка поиска в MariaDB для «${article}»: ${err.message}`,
      );
    }

    // ── Уровень 3: не найден ──────────────────────────────────────────────────
    this.logger.warn(
      `[${tenant.id}] ⚠️ resolveProductTcod: артикул «${article}» не сопоставлен ни с одним tcod`,
    );
    return { tcod: null, resolvedVia: 'not_found' };
  }

  /**
   * Определить флаг создания черновика документа (tip_dok: 85) в зависимости от источника заказа.
   * Использует прозрачный switch-case для легкой расширяемости по всем платформам.
   */
  private resolveCreateDocumentFlag(
    tenant: Tenant,
    source: 'horoshop' | 'woocommerce' | 'prom' | 'rozetka',
    overrideValue?: boolean,
  ): boolean {
    if (overrideValue !== undefined) {
      return overrideValue;
    }

    switch (source) {
      case 'prom':
        return tenant.promCreateOrderDocumentEnabled ?? false;
      case 'woocommerce':
        return tenant.woocommerceCreateOrderDocumentEnabled ?? false;
      case 'horoshop':
        return tenant.horoshopCreateOrderDocumentEnabled ?? false;
      case 'rozetka':
      default:
        return false;
    }
  }

  /**
   * Единая точка обработки входящего заказа (ACL → Domain Logic).
   *
   * @param tenant         Модель тенанта
   * @param dto            Унифицированный заказ
   * @param integrationId  ID интеграции (для product_mappings)
   * @param opts.createDocument  true — Режим 2 (экспериментальный)
   */
  async processIncomingOrder(
    tenant: Tenant,
    dto: UnifiedIncomingOrderDto,
    integrationId: string | null = null,
    opts: { createDocument?: boolean } = {},
  ): Promise<ProcessOrderResult> {
    const createDocument = this.resolveCreateDocumentFlag(
      tenant,
      dto.source,
      opts.createDocument,
    );

    this.logger.log(
      `🛒 [${tenant.id}] Обработка заказа #${dto.externalOrderId} из ${dto.source} | ` +
        `режим: ${createDocument ? 'Режим 2 (черновик документа)' : 'Режим 1 (только списание)'}`,
    );

    const resolvedItems: ResolvedLineItem[] = [];
    const deductedItems: Array<{
      tcod: number;
      qty: number;
      oldStock: number;
      newStock: number;
    }> = [];
    const skippedArticles: string[] = [];
    const warnings: string[] = [];

    // ── 1. Резолв всех позиций заказа ────────────────────────────────────────
    for (const lineItem of dto.lineItems) {
      const { tcod, resolvedVia } = await this.resolveProductTcod(
        tenant,
        integrationId,
        lineItem.externalArticle,
      );

      const resolved: ResolvedLineItem = {
        externalArticle: lineItem.externalArticle,
        tcod,
        name: lineItem.name,
        quantity: lineItem.quantity,
        price: lineItem.price,
        discount: lineItem.discount,
        resolvedVia,
      };
      resolvedItems.push(resolved);

      if (tcod === null) {
        const warn = `⚠️ Артикул «${lineItem.externalArticle}» не найден в номенклатуре Лимана`;
        warnings.push(warn);
        skippedArticles.push(lineItem.externalArticle);

        // Алерт в Telegram по ненайденным позициям
        void this.alertService?.sendCritical(
          dto.source,
          `Ненайденный артикул в заказе [${tenant.id}]`,
          `Заказ #${dto.externalOrderId}: ${warn}. Остаток не списан.`,
          undefined,
          tenant.id,
          { externalOrderId: dto.externalOrderId, article: lineItem.externalArticle },
        );
      }
    }

    // ── 2. Режим 1: атомарное списание остатков ───────────────────────────────
    if (!createDocument) {
      for (const item of resolvedItems) {
        if (item.tcod === null || item.quantity <= 0) continue;

        try {
          const deduction = await this.limanService.deductStock(
            tenant,
            item.tcod,
            item.quantity,
          );
          deductedItems.push({
            tcod: item.tcod,
            qty: item.quantity,
            oldStock: deduction.oldStock,
            newStock: deduction.newStock,
          });
        } catch (err: any) {
          const errMsg = `Ошибка списания tcod=${item.tcod} (×${item.quantity}): ${err.message}`;
          warnings.push(errMsg);
          this.logger.error(`[${tenant.id}] ${errMsg}`);

          void this.alertService?.sendCritical(
            dto.source,
            `Ошибка списания остатка [${tenant.id}]`,
            `Заказ #${dto.externalOrderId}: ${errMsg}`,
            err.stack,
            tenant.id,
            { externalOrderId: dto.externalOrderId, tcod: item.tcod, qty: item.quantity },
          );
        }
      }

      this.logger.log(
        `✅ [${tenant.id}] Режим 1: заказ #${dto.externalOrderId} — списано ${deductedItems.length} позиций, ` +
          `пропущено ${skippedArticles.length} (артикулы не найдены)`,
      );

      return {
        externalOrderId: dto.externalOrderId,
        source: dto.source,
        mode: 'deduct_only',
        resolvedItems,
        deductedItems,
        skippedArticles,
        warnings,
        success: true,
      };
    }

    // ── 3. Режим 2 (экспериментальный): создание черновика накладной ──────────
    // Архитектурная заметка: полная реализация требует точной схемы таблиц
    // nshap, nakltelo, ndok, checkdok конкретной версии Limansoft.
    // Реализован атомарный каркас с транзакционной защитой.
    try {
      const docResult = await this.createOrderDocument(tenant, dto, resolvedItems);
      deductedItems.push(...docResult.deductedItems);

      this.logger.log(
        `✅ [${tenant.id}] Режим 2: черновик накладной создан | n_dok=${docResult.nDok}, nshap.count=${docResult.nshapCount}`,
      );

      return {
        externalOrderId: dto.externalOrderId,
        source: dto.source,
        mode: 'create_document',
        resolvedItems,
        deductedItems,
        skippedArticles,
        warnings,
        success: true,
      };
    } catch (err: any) {
      const errMsg = `Ошибка создания черновика накладной: ${err.message}`;
      this.logger.error(`[${tenant.id}] ${errMsg}`, err.stack);

      void this.alertService?.sendCritical(
        dto.source,
        `Ошибка Режима 2 [${tenant.id}]`,
        `Заказ #${dto.externalOrderId}: ${errMsg}`,
        err.stack,
        tenant.id,
        { externalOrderId: dto.externalOrderId },
      );

      return {
        externalOrderId: dto.externalOrderId,
        source: dto.source,
        mode: 'create_document',
        resolvedItems,
        deductedItems,
        skippedArticles,
        warnings: [...warnings, errMsg],
        success: false,
      };
    }
  }

  /**
   * Создание черновика заказа покупателя в таблицах Limansoft (Режим 2).
   *
   * Таблицы:
   * - ndok: счётчик номеров документов (SELECT ... FOR UPDATE для блокировки)
   * - nshap: заголовок накладной (tip_dok=85, prov='f' — непроведённый черновик)
   * - nakltelo: строки накладной (позиции заказа)
   * - checkdok: реестр заказов для Лимана
   * - dmonitor: журнал аудита операций
   *
   * Защита: вся операция выполняется в единой транзакции MariaDB.
   * kklient=2 — системный клиент «конечный потребитель» в Limansoft.
   */
  private async createOrderDocument(
    tenant: Tenant,
    dto: UnifiedIncomingOrderDto,
    resolvedItems: ResolvedLineItem[],
  ): Promise<{
    nDok: number;
    nshapCount: number;
    deductedItems: Array<{ tcod: number; qty: number; oldStock: number; newStock: number }>;
  }> {
    const pool = this.connectionManager.getPool(tenant);
    const conn = await pool.getConnection();
    const deductedItems: Array<{ tcod: number; qty: number; oldStock: number; newStock: number }> = [];

    try {
      await conn.beginTransaction();

      // 1. Блокировка счётчика номеров документов (защита от коллизий с операторами)
      const [ndokRows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT n_dok FROM `ndok` WHERE flt5 = 85 FOR UPDATE',
      );

      let nDok = 1;
      if (ndokRows.length > 0 && ndokRows[0].n_dok) {
        nDok = Number(ndokRows[0].n_dok) + 1;
        await conn.query('UPDATE `ndok` SET n_dok = ? WHERE flt5 = 85', [nDok]);
      } else {
        // Если записи нет — создаём
        await conn.query('INSERT INTO `ndok` (flt5, n_dok) VALUES (85, 1) ON DUPLICATE KEY UPDATE n_dok = n_dok + 1', []);
      }

      const today = new Date().toISOString().slice(0, 10);
      const now = new Date().toTimeString().slice(0, 8);

      // Примечание: ФИО, телефон, отделение НП
      const primNote = [
        dto.customerName ? `Клиент: ${dto.customerName}` : '',
        dto.customerPhone ? `Тел: ${dto.customerPhone}` : '',
        dto.deliveryAddress || dto.deliveryWarehouse
          ? `Доставка: ${dto.deliveryAddress || dto.deliveryWarehouse}`
          : '',
        `Источник: ${dto.source} / Заказ #${dto.externalOrderId}`,
      ]
        .filter(Boolean)
        .join('; ')
        .substring(0, 255);

      const totalAmount = dto.totalAmount ??
        resolvedItems.reduce((sum, i) => sum + i.price * i.quantity - (i.discount ?? 0), 0);

      // 2. Создание заголовка накладной в nshap (tip_dok=85, prov='f')
      const [nshapResult] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO \`nshap\`
           (tip_dok, n_dok, date, time, kklient, kklient2, prov, summa, skidka, prim, fullprim, uname, n_mach)
         VALUES (85, ?, ?, ?, 2, 2, 'f', ?, 0, ?, ?, 'WEB-API', 99)`,
        [
          nDok,
          today,
          now,
          totalAmount,
          primNote,
          dto.rawPayload ? JSON.stringify(dto.rawPayload).substring(0, 1000) : primNote,
        ],
      );
      const nshapCount = nshapResult.insertId || 0;

      // 3. Создание строк накладной в nakltelo + списание остатков
      let lineIndex = 1;
      for (const item of resolvedItems) {
        if (item.tcod === null || item.quantity <= 0) continue;

        await conn.query(
          `INSERT INTO \`nakltelo\`
             (count, tip_dok, n_dok, tcod, kol, cena, summa, \`index\`)
           VALUES (?, 85, ?, ?, ?, ?, ?, ?)`,
          [
            nshapCount,
            nDok,
            item.tcod,
            item.quantity,
            item.price,
            item.price * item.quantity - (item.discount ?? 0),
            lineIndex,
          ],
        );

        // Списание остатка в рамках той же транзакции
        const rawStockCol = tenant.stockColumn || 'skl_k';
        const stockCol = /^[a-zA-Z0-9_]+$/.test(rawStockCol) ? rawStockCol : 'skl_k';
        const [stockRows] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT \`${stockCol}\` as currStock FROM \`name2ost\` WHERE tcod = ? LIMIT 1`,
          [item.tcod],
        );
        const oldStock = stockRows.length ? Number(stockRows[0].currStock ?? 0) : 0;
        const newStock = Math.max(0, oldStock - item.quantity);

        if (stockRows.length === 0) {
          await conn.query(
            `INSERT INTO \`name2ost\` (tcod, \`${stockCol}\`) VALUES (?, ?)`,
            [item.tcod, newStock],
          );
        } else {
          await conn.query(
            `UPDATE \`name2ost\` SET \`${stockCol}\` = ? WHERE tcod = ?`,
            [newStock, item.tcod],
          );
        }

        deductedItems.push({ tcod: item.tcod, qty: item.quantity, oldStock, newStock });
        lineIndex++;
      }

      // 4. Запись в реестр заказов checkdok
      await conn.query(
        `INSERT INTO \`checkdok\` (count, tip_dok, n_dok, kklient, kklient2)
         VALUES (?, 85, ?, 2, 2)
         ON DUPLICATE KEY UPDATE tip_dok = tip_dok`,
        [nshapCount, nDok],
      );

      // 5. Аудит в dmonitor
      await conn.query(
        `INSERT INTO \`dmonitor\`
           (date, time, action, tcod, name, kol, count, uname, n_mach)
         VALUES (?, ?, 'Создан заказ WEB-API', 0, ?, 0, ?, 'WEB-API', 99)`,
        [
          today,
          now,
          `${dto.source} #${dto.externalOrderId}`,
          nshapCount,
        ],
      );

      await conn.commit();

      return { nDok, nshapCount, deductedItems };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
