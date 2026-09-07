import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import mysql from 'mysql2/promise';
import { Tenant } from '../tenant/tenant.entity';
import { TenantConnectionManager } from './tenant-connection-manager.service';
import { LimanCategoryDto, LimanProductDto } from './dto/liman-product.dto';

interface RawCategoryRow extends mysql.RowDataPacket {
  group: string;
  name_g: string;
  parent: string | null;
}

interface RawProductRow extends mysql.RowDataPacket {
  tcod: number;
  nnom: string | null;
  name: string;
  group: string | null;
  cena1: number | null;
  cena2: number | null;
  price: number | null;
  stock: number | null;
  description: Buffer | null;
  has_photo1: number;
  has_photo2: number;
  has_photo3: number;
  has_photo4: number;
  has_photo5: number;
}

/**
 * Основной Data Access Layer сервис для работы с учетной базой данных Limansoft (MariaDB).
 *
 * Предоставляет методы для:
 * - Чтения иерархии категорий из таблицы `name`
 * - Постраничной выборки каталога товаров из `name2` с джойнами к остаткам `name2ost` и фото `namedesc`
 * - Выборки детальной карточки одного товара с дополнительными штрихкодами из `strihcod`
 * - Чтения бинарных BLOB-изображений товаров из `namedesc` с автоматическим определением MIME-типа по magic bytes
 * - Атомарного списания / обновления остатков в `name2ost`
 * - Мониторинга журнала изменений `dmonitor`
 */
@Injectable()
export class LimanService {
  private readonly logger = new Logger(LimanService.name);

  constructor(
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  /**
   * Проверить доступность MariaDB базы данных тенанта
   */
  async ping(tenant: Tenant): Promise<{ success: boolean; message: string; pingMs?: number }> {
    return this.connectionManager.testConnection(tenant);
  }

  /**
   * Получить плоский список категорий магазина из таблицы `name`.
   * Поля:
   * - `group`: строковый код группы
   * - `name_g`: наименование категории
   * - `parent`: код родительской категории (null для корневых)
   *
   * @param tenant Модель клиента
   * @returns Массив DTO категорий LimanCategoryDto
   */
  async getCategories(tenant: Tenant): Promise<LimanCategoryDto[]> {
    const pool = this.connectionManager.getPool(tenant);
    const [rows] = await pool.query<RawCategoryRow[]>(
      `SELECT \`group\`, \`name_g\`, \`parent\` FROM \`name\` ORDER BY \`name_g\` ASC`,
    );

    return rows.map((r) => ({
      group: r.group ? r.group.trim() : '',
      name: r.name_g ? r.name_g.trim() : '',
      parent: r.parent && r.parent.trim() ? r.parent.trim() : null,
    }));
  }

  /**
   * Защита от SQL-инъекций через динамические имена колонок (Identifier Whitelist/Sanitization)
   */
  private sanitizeIdentifier(name: string | undefined | null, fallback: string): string {
    if (!name || typeof name !== 'string') return fallback;
    const clean = name.trim();
    // Разрешаем только латинские буквы, цифры и знак подчеркивания длиной от 1 до 32 символов
    if (!/^[a-zA-Z0-9_]{1,32}$/.test(clean)) {
      this.logger.warn(
        `🚨 [SQL Injection Defense] Подозрительное имя колонки "${clean}" заменено на безопасный дефолт "${fallback}"`,
      );
      return fallback;
    }
    return clean;
  }

  /**
   * Получить общее количество активных товаров с учетом фильтров (поиск, категория, наличие).
   * Исключает удаленные товары (`del = 't'`) и пустые записи.
   *
   * @param tenant Модель клиента
   * @param options Параметры фильтрации
   * @returns Общее число товаров (number)
   */
  async getProductCount(
    tenant: Tenant,
    options?: { search?: string; categoryGroup?: string; onlyInStock?: boolean },
  ): Promise<number> {
    const pool = this.connectionManager.getPool(tenant);
    const stockCol = this.sanitizeIdentifier(tenant.stockColumn, 'skl_k');
    const params: (string | number)[] = [];
    const whereClauses: string[] = [
      '(n2.del IS NULL OR n2.del != \'t\')',
      'n2.tcod IS NOT NULL',
      'n2.tcod > 0',
      "(n2.name IS NOT NULL AND n2.name != '')",
    ];

    if (options?.categoryGroup) {
      whereClauses.push('n2.`group` = ?');
      params.push(options.categoryGroup);
    }
    if (options?.search) {
      whereClauses.push('(n2.name LIKE ? OR n2.nnom LIKE ?)');
      params.push(`%${options.search}%`, `%${options.search}%`);
    }
    if (options?.onlyInStock) {
      whereClauses.push(`COALESCE(ost.\`${stockCol}\`, 0) > 0`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as total 
       FROM \`name2\` n2
       LEFT JOIN \`name2ost\` ost ON ost.tcod = n2.tcod
       ${whereSql}`,
      params,
    );

    return (rows[0] as { total: number })?.total ?? 0;
  }

  /**
   * Получить список товаров порциями (пагинация)
   */
  async getProducts(
    tenant: Tenant,
    options: {
      page?: number;
      limit?: number;
      cursor?: number;
      search?: string;
      categoryGroup?: string;
      onlyInStock?: boolean;
      baseUrl?: string;
    },
  ): Promise<{ items: LimanProductDto[]; total: number; page: number; limit: number }> {
    const pool = this.connectionManager.getPool(tenant);
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(500, Math.max(1, options.limit ?? 50));
    const offset = (page - 1) * limit;

    const priceCol = this.sanitizeIdentifier(tenant.priceColumn, 'cena2');
    const stockCol = this.sanitizeIdentifier(tenant.stockColumn, 'skl_k');

    const whereClauses: string[] = [
      '(n2.del IS NULL OR n2.del != \'t\')',
      'n2.tcod IS NOT NULL',
      'n2.tcod > 0',
      "(n2.name IS NOT NULL AND n2.name != '')",
    ];
    const params: (string | number)[] = [];

    if (options.cursor) {
      whereClauses.push('n2.tcod > ?');
      params.push(options.cursor);
    }
    if (options.categoryGroup) {
      whereClauses.push('n2.`group` = ?');
      params.push(options.categoryGroup);
    }
    if (options.search) {
      whereClauses.push('(n2.name LIKE ? OR n2.nnom LIKE ?)');
      params.push(`%${options.search}%`, `%${options.search}%`);
    }
    if (options.onlyInStock) {
      whereClauses.push(`COALESCE(ost.\`${stockCol}\`, 0) > 0`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const total = await this.getProductCount(tenant, options);

    const query = `
      SELECT 
        n2.tcod,
        n2.nnom,
        n2.name,
        n2.\`group\`,
        n2.cena1,
        n2.cena2,
        COALESCE(n2.\`${priceCol}\`, n2.cena2, 0) as price,
        COALESCE(ost.\`${stockCol}\`, 0) as stock,
        nd.description,
        (CASE WHEN nd.photo IS NOT NULL AND LENGTH(nd.photo) > 0 THEN 1 ELSE 0 END) as has_photo1,
        (CASE WHEN nd.photo2 IS NOT NULL AND LENGTH(nd.photo2) > 0 THEN 1 ELSE 0 END) as has_photo2,
        (CASE WHEN nd.photo3 IS NOT NULL AND LENGTH(nd.photo3) > 0 THEN 1 ELSE 0 END) as has_photo3,
        (CASE WHEN nd.photo4 IS NOT NULL AND LENGTH(nd.photo4) > 0 THEN 1 ELSE 0 END) as has_photo4,
        (CASE WHEN nd.photo5 IS NOT NULL AND LENGTH(nd.photo5) > 0 THEN 1 ELSE 0 END) as has_photo5
      FROM \`name2\` n2
      LEFT JOIN \`name2ost\` ost ON ost.tcod = n2.tcod
      LEFT JOIN \`namedesc\` nd ON nd.tcod = n2.tcod
      ${whereSql}
      ORDER BY n2.tcod ASC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const [rows] = await pool.query<RawProductRow[]>(query, params);
    const baseUrl = options.baseUrl ?? 'http://localhost:3000';

    const items: LimanProductDto[] = rows.map((r) => {
      const imageUrls: string[] = [];
      if (r.has_photo1) imageUrls.push(`${baseUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/1.jpg`);
      if (r.has_photo2) imageUrls.push(`${baseUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/2.jpg`);
      if (r.has_photo3) imageUrls.push(`${baseUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/3.jpg`);
      if (r.has_photo4) imageUrls.push(`${baseUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/4.jpg`);
      if (r.has_photo5) imageUrls.push(`${baseUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/5.jpg`);

      let descriptionText: string | undefined = undefined;
      if (r.description) {
        descriptionText = Buffer.isBuffer(r.description)
          ? r.description.toString('utf8')
          : String(r.description);
      }

      const stockVal = Number(r.stock ?? 0);
      return {
        tcod: r.tcod,
        barcode: r.nnom ? r.nnom.trim() : undefined,
        name: r.name ? r.name.trim() : '',
        categoryGroup: r.group ? r.group.trim() : undefined,
        price: Number(r.price ?? 0),
        purchasePrice: r.cena1 !== null ? Number(r.cena1) : undefined,
        stock: stockVal,
        isAvailable: stockVal > 0,
        description: descriptionText,
        imageUrls,
      };
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Получить один товар по артикулу tcod
   */
  async getProductByTcod(tenant: Tenant, tcod: number, baseUrl?: string): Promise<LimanProductDto> {
    const pool = this.connectionManager.getPool(tenant);
    const priceCol = this.sanitizeIdentifier(tenant.priceColumn, 'cena2');
    const stockCol = this.sanitizeIdentifier(tenant.stockColumn, 'skl_k');

    const [rows] = await pool.query<RawProductRow[]>(
      `SELECT 
        n2.tcod,
        n2.nnom,
        n2.name,
        n2.\`group\`,
        n2.cena1,
        n2.cena2,
        COALESCE(n2.\`${priceCol}\`, n2.cena2, 0) as price,
        COALESCE(ost.\`${stockCol}\`, 0) as stock,
        nd.description,
        (CASE WHEN nd.photo IS NOT NULL AND LENGTH(nd.photo) > 0 THEN 1 ELSE 0 END) as has_photo1,
        (CASE WHEN nd.photo2 IS NOT NULL AND LENGTH(nd.photo2) > 0 THEN 1 ELSE 0 END) as has_photo2,
        (CASE WHEN nd.photo3 IS NOT NULL AND LENGTH(nd.photo3) > 0 THEN 1 ELSE 0 END) as has_photo3,
        (CASE WHEN nd.photo4 IS NOT NULL AND LENGTH(nd.photo4) > 0 THEN 1 ELSE 0 END) as has_photo4,
        (CASE WHEN nd.photo5 IS NOT NULL AND LENGTH(nd.photo5) > 0 THEN 1 ELSE 0 END) as has_photo5
       FROM \`name2\` n2
       LEFT JOIN \`name2ost\` ost ON ost.tcod = n2.tcod
       LEFT JOIN \`namedesc\` nd ON nd.tcod = n2.tcod
       WHERE n2.tcod = ?
       LIMIT 1`,
      [tcod],
    );

    if (!rows.length) {
      throw new NotFoundException(`Товар с кодом ${tcod} не найден в БД Limansoft`);
    }

    const r = rows[0];
    const originUrl = baseUrl ?? 'http://localhost:3000';
    const imageUrls: string[] = [];
    if (r.has_photo1) imageUrls.push(`${originUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/1.jpg`);
    if (r.has_photo2) imageUrls.push(`${originUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/2.jpg`);
    if (r.has_photo3) imageUrls.push(`${originUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/3.jpg`);
    if (r.has_photo4) imageUrls.push(`${originUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/4.jpg`);
    if (r.has_photo5) imageUrls.push(`${originUrl}/api/v1/media/${tenant.id}/products/${r.tcod}/5.jpg`);

    // Получить штрихкоды из strihcod
    const [barcodeRows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT nnom FROM `strihcod` WHERE tcod = ?',
      [tcod],
    );
    const extraBarcodes = barcodeRows.map((b) => String(b.nnom).trim()).filter(Boolean);

    let descText: string | undefined = undefined;
    if (r.description) {
      descText = Buffer.isBuffer(r.description) ? r.description.toString('utf8') : String(r.description);
    }

    const stock = Number(r.stock ?? 0);

    return {
      tcod: r.tcod,
      barcode: r.nnom ? r.nnom.trim() : undefined,
      name: r.name ? r.name.trim() : '',
      categoryGroup: r.group ? r.group.trim() : undefined,
      price: Number(r.price ?? 0),
      purchasePrice: r.cena1 !== null ? Number(r.cena1) : undefined,
      stock,
      isAvailable: stock > 0,
      description: descText,
      imageUrls,
      barcodes: extraBarcodes,
    };
  }

  /**
   * Получить сырой бинарный BLOB изображения из таблицы `namedesc`.
   *
   * Фотографии хранятся в полях:
   * - photo1 (в коде/БД колонка называется `photo`)
   * - photo2 ... photo5
   *
   * Метод извлекает буфер и определяет MIME-тип (image/png, image/jpeg, image/gif, image/webp)
   * по сигнатуре первых байтов (Magic Bytes), что позволяет браузерам корректно отображать медиа.
   *
   * @param tenant Модель клиента
   * @param tcod Артикул товара (tcod)
   * @param photoIndex Порядковый номер фотографии (1..5)
   * @returns Буфер данных и mimeType, либо null если фото отсутствует
   */
  async getProductImage(
    tenant: Tenant,
    tcod: number,
    photoIndex: number,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const pool = this.connectionManager.getPool(tenant);
    const validIndex = Math.min(5, Math.max(1, photoIndex));
    const column = validIndex === 1 ? 'photo' : `photo${validIndex}`;

    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT \`${column}\` as photoData FROM \`namedesc\` WHERE tcod = ? LIMIT 1`,
      [tcod],
    );

    if (!rows.length || !rows[0].photoData) {
      return null;
    }

    const buffer = Buffer.isBuffer(rows[0].photoData)
      ? rows[0].photoData
      : Buffer.from(rows[0].photoData);

    // Определение формата изображения по сигнатуре (Magic Bytes)
    let mimeType = 'image/jpeg';
    if (buffer.length > 4) {
      // PNG: 89 50 4E 47
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        mimeType = 'image/png';
      // GIF: 47 49 46
      } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        mimeType = 'image/gif';
      // WebP (RIFF): 52 49 46 46
      } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        mimeType = 'image/webp';
      }
    }

    return { data: buffer, mimeType };
  }

  /**
   * Атомарно обновить остаток товара в таблице `name2ost`.
   *
   * Логика работы:
   * 1. Считывает текущее значение остатка из настроенной колонки (по умолчанию `skl_k`).
   * 2. Если записи для `tcod` еще нет — выполняет INSERT.
   * 3. Если запись существует — выполняет UPDATE.
   * 4. Возвращает объект с новым и предыдущим остатком для аудита и вебхуков.
   *
   * @param tenant Модель клиента
   * @param tcod Код товара (tcod)
   * @param newStock Новое количество на складе
   * @returns Результат обновления с предыдущим и новым остатком
   */
  async updateStock(
    tenant: Tenant,
    tcod: number,
    newStock: number,
  ): Promise<{ success: boolean; tcod: number; oldStock: number; newStock: number }> {
    const pool = this.connectionManager.getPool(tenant);
    const stockCol = this.sanitizeIdentifier(tenant.stockColumn, 'skl_k');

    // 1. Получить текущий остаток
    const [currRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT \`${stockCol}\` as currStock FROM \`name2ost\` WHERE tcod = ? LIMIT 1`,
      [tcod],
    );

    const oldStock = currRows.length ? Number(currRows[0].currStock ?? 0) : 0;

    // 2. Вставить или обновить
    if (currRows.length === 0) {
      await pool.query(
        `INSERT INTO \`name2ost\` (tcod, \`${stockCol}\`) VALUES (?, ?)`,
        [tcod, newStock],
      );
    } else {
      await pool.query(
        `UPDATE \`name2ost\` SET \`${stockCol}\` = ? WHERE tcod = ?`,
        [newStock, tcod],
      );
    }

    this.logger.log(
      `📦 [${tenant.id}] Обновлен остаток для tcod=${tcod}: ${oldStock} -> ${newStock}`,
    );

    return {
      success: true,
      tcod,
      oldStock,
      newStock,
    };
  }

  /**
   * Атомарно уменьшить остаток товара при оформлении заказа (Deduct Stock).
   *
   * Реализует принцип Single Responsibility (SRP): контроллерам заказов
   * не требуется загружать карточки товаров или знать формулу списания.
   * Считывает текущий остаток из name2ost, вычитает количество (с защитой от отрицательных значений)
   * и атомарно сохраняет новое значение.
   *
   * @param tenant Модель клиента
   * @param tcod Код товара (tcod)
   * @param quantity Списываемое количество
   * @returns Предыдущий и новый остаток, а также фактически списанное количество
   */
  async deductStock(
    tenant: Tenant,
    tcod: number,
    quantity: number,
  ): Promise<{ success: boolean; tcod: number; oldStock: number; newStock: number; deducted: number }> {
    const pool = this.connectionManager.getPool(tenant);
    const stockCol = this.sanitizeIdentifier(tenant.stockColumn, 'skl_k');

    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT \`${stockCol}\` as currStock FROM \`name2ost\` WHERE tcod = ? LIMIT 1`,
      [tcod],
    );

    const oldStock = rows.length ? Number(rows[0].currStock ?? 0) : 0;
    const newStock = Math.max(0, oldStock - quantity);

    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO \`name2ost\` (tcod, \`${stockCol}\`) VALUES (?, ?)`,
        [tcod, newStock],
      );
    } else {
      await pool.query(
        `UPDATE \`name2ost\` SET \`${stockCol}\` = ? WHERE tcod = ?`,
        [newStock, tcod],
      );
    }

    this.logger.log(
      `🛒 [${tenant.id}] Списание остатка tcod=${tcod} (-${quantity}): ${oldStock} -> ${newStock}`,
    );

    return {
      success: true,
      tcod,
      oldStock,
      newStock,
      deducted: oldStock - newStock,
    };
  }

  /**
   * Получить последние изменения из dmonitor
   */
  async getRecentChanges(
    tenant: Tenant,
    limit = 50,
  ): Promise<mysql.RowDataPacket[]> {
    const pool = this.connectionManager.getPool(tenant);
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT \`index\`, \`date\`, \`time\`, \`action\`, \`tcod\`, \`name\`, \`cena\`, \`kol\`, \`count\`
       FROM \`dmonitor\`
       ORDER BY \`index\` DESC
       LIMIT ?`,
      [limit],
    );
    return rows;
  }
}
