import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenant/tenant.entity';
import { TenantConnectionManager } from '../liman/tenant-connection-manager.service';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import IORedis from 'ioredis';
import mysql from 'mysql2/promise';

export const BACKUP_REDIS_CLIENT = 'BACKUP_REDIS_CLIENT';

/**
 * Таблицы для быстрого бэкапа (без тяжелых BLOB фотографий).
 * Размер: 5–15 МБ на 5 000–10 000 товаров, создаётся за 1–2 секунды.
 */
export const FAST_BACKUP_TABLES = ['name', 'name2', 'name2ost', 'strihcod'];

/**
 * Дополнительные таблицы для полного бэкапа (включают BLOB-фотографии).
 * Размер: 500 МБ — 3 ГБ, выполняется асинхронно.
 */
export const FULL_BACKUP_EXTRA_TABLES = ['namedesc'];

const MAX_BACKUPS = 10;
const MAX_BACKUP_AGE_DAYS = 30;
const REDIS_LOCK_TTL_MS = 5 * 60 * 1000; // 5 минут

export type BackupMode = 'fast' | 'full';

export interface BackupMeta {
  filename: string;
  mode: BackupMode;
  createdAt: string;
  sizeBytes: number;
  sizeMb: string;
  sha256: string;
  skuCount?: number;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupsBaseDir: string;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly connectionManager: TenantConnectionManager,
    @Inject(BACKUP_REDIS_CLIENT)
    private readonly redis: IORedis,
  ) {
    this.backupsBaseDir = path.resolve(process.cwd(), 'data', 'backups');
  }

  // ─── Lock helpers ────────────────────────────────────────────────────────────

  lockKey(tenantId: string) {
    return `lock:tenant:${tenantId}:busy`;
  }

  /**
   * Попытаться захватить Redis-мьютекс.
   * @returns true если лок успешно захвачен, false если занято
   */
  async acquireLock(tenantId: string): Promise<boolean> {
    const result = await this.redis.set(
      this.lockKey(tenantId),
      'backup',
      'PX',
      REDIS_LOCK_TTL_MS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseLock(tenantId: string): Promise<void> {
    await this.redis.del(this.lockKey(tenantId));
  }

  async isLocked(tenantId: string): Promise<boolean> {
    const val = await this.redis.get(this.lockKey(tenantId));
    return val !== null;
  }

  // ─── Directory helpers ───────────────────────────────────────────────────────

  getTenantBackupDir(tenantId: string): string {
    const dir = path.join(this.backupsBaseDir, tenantId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  buildFilename(tenantId: string, mode: BackupMode): string {
    const now = new Date();
    const ts = now
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 23); // Include milliseconds: 2026-09-16_09-00-00-123
    return `backup_${tenantId}_${ts}_${mode}.sql.gz`;
  }

  // ─── SQL dump generator ───────────────────────────────────────────────────────

  /**
   * Сгенерировать SQL-дамп выбранных таблиц через mysql2 pool.
   */
  async generateSqlDump(
    pool: mysql.Pool,
    dbName: string,
    tables: string[],
  ): Promise<string> {
    const lines: string[] = [];
    lines.push(`-- Liman Web API Database Backup`);
    lines.push(`-- Database: ${dbName}`);
    lines.push(`-- Tables: ${tables.join(', ')}`);
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('SET FOREIGN_KEY_CHECKS=0;');
    lines.push('SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";');
    lines.push('START TRANSACTION;');
    lines.push('');

    for (const table of tables) {
      try {
        // 1. Получить CREATE TABLE
        const [createRows] = await pool.query<mysql.RowDataPacket[]>(
          `SHOW CREATE TABLE \`${table}\``,
        );
        const createStmt = (createRows[0] as { 'Create Table': string })[
          'Create Table'
        ];
        lines.push(
          `-- ─── Table: ${table} ────────────────────────────────────`,
        );
        lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
        lines.push(`${createStmt};`);
        lines.push('');

        // 2. Постраничная выборка данных (500 строк в пакете)
        const BATCH = 500;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const [rows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT * FROM \`${table}\` LIMIT ${BATCH} OFFSET ${offset}`,
          );

          if (rows.length === 0) {
            hasMore = false;
            break;
          }

          const cols = Object.keys(rows[0])
            .map((c) => `\`${c}\``)
            .join(', ');

          const values = rows
            .map((row) => {
              const vals = Object.values(row).map((v) => {
                if (v === null || v === undefined) return 'NULL';
                if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
                if (typeof v === 'number') return String(v);
                if (typeof v === 'boolean') return v ? '1' : '0';
                if (v instanceof Date) {
                  return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
                }
                const str = String(v)
                  .replace(/\\/g, '\\\\')
                  .replace(/'/g, "\\'")
                  .replace(/\n/g, '\\n')
                  .replace(/\r/g, '\\r')
                  // eslint-disable-next-line no-control-regex
                  .replace(/\x00/g, '\\0');
                return `'${str}'`;
              });
              return `(${vals.join(', ')})`;
            })
            .join(',\n');

          lines.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
          lines.push(`${values};`);
          lines.push('');

          offset += rows.length;
          if (rows.length < BATCH) hasMore = false;
        }
      } catch (err) {
        this.logger.warn(
          `⚠️ Пропуск таблицы "${table}": ${err instanceof Error ? err.message : err}`,
        );
        lines.push(
          `-- WARNING: Table "${table}" skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
        lines.push('');
      }
    }

    lines.push('COMMIT;');
    lines.push('SET FOREIGN_KEY_CHECKS=1;');
    lines.push('');
    return lines.join('\n');
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Создать резервную копию базы данных тенанта.
   * Режим `fast`: только учётные таблицы без фото (~5–15 МБ, 1–2 сек).
   * Режим `full`: + `namedesc` с BLOB-фотографиями (может занять минуты).
   */
  async createBackup(
    tenantId: string,
    mode: BackupMode = 'fast',
  ): Promise<BackupMeta> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Тенант "${tenantId}" не найден`);

    // Попытка захватить Redis lock
    const locked = await this.acquireLock(tenantId);
    if (!locked) {
      throw new ConflictException(
        `Тенант "${tenantId}" занят другой операцией. Повторите позже.`,
      );
    }

    const startTime = Date.now();
    this.logger.log(
      `💾 [${tenantId}] Начало создания бэкапа (режим: ${mode})...`,
    );

    try {
      const tables =
        mode === 'full'
          ? [...FAST_BACKUP_TABLES, ...FULL_BACKUP_EXTRA_TABLES]
          : [...FAST_BACKUP_TABLES];

      const pool = this.connectionManager.getPool(tenant);

      // Сгенерировать SQL
      const sql = await this.generateSqlDump(pool, tenant.dbName, tables);

      // Подсчёт SKU
      let skuCount: number | undefined;
      try {
        const [countRows] = await pool.query<mysql.RowDataPacket[]>(
          `SELECT COUNT(*) as cnt FROM \`name2\` WHERE del != 't' OR del IS NULL`,
        );
        skuCount = (countRows[0] as { cnt: number }).cnt;
      } catch {
        // не критично
      }

      // Запись gzip-файла
      const dir = this.getTenantBackupDir(tenantId);
      const filename = this.buildFilename(tenantId, mode);
      const filepath = path.join(dir, filename);

      const sqlStream = Readable.from([sql]);
      const gzipStream = zlib.createGzip({ level: 9 });
      const outputStream = fs.createWriteStream(filepath);
      await pipeline(sqlStream, gzipStream, outputStream);

      const stat = fs.statSync(filepath);
      const sha256 = await this.computeSha256(filepath);

      const meta: BackupMeta = {
        filename,
        mode,
        createdAt: new Date().toISOString(),
        sizeBytes: stat.size,
        sizeMb: (stat.size / 1024 / 1024).toFixed(2),
        sha256,
        skuCount,
      };

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ [${tenantId}] Бэкап создан за ${duration}ms: "${filename}" (${meta.sizeMb} МБ, ${skuCount ?? '?'} SKU)`,
      );

      // Ротация старых архивов
      await this.rotateOldBackups(tenantId);

      return meta;
    } finally {
      await this.releaseLock(tenantId);
    }
  }

  /**
   * Получить список всех резервных копий тенанта, новые первые.
   */
  async listBackups(tenantId: string): Promise<BackupMeta[]> {
    await Promise.resolve();
    const dir = this.getTenantBackupDir(tenantId);
    const files = fs
      .readdirSync(dir)
      .filter(
        (f) => f.endsWith('.sql.gz') && f.startsWith(`backup_${tenantId}_`),
      );

    const metas: BackupMeta[] = files.map((filename) => {
      const filepath = path.join(dir, filename);
      const stat = fs.statSync(filepath);
      const mode: BackupMode = filename.endsWith('_full.sql.gz')
        ? 'full'
        : 'fast';
      return {
        filename,
        mode,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        sizeMb: (stat.size / 1024 / 1024).toFixed(2),
        sha256: '',
      };
    });

    return metas.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Получить абсолютный путь к файлу бэкапа (с защитой от path traversal).
   */
  getBackupFilePath(tenantId: string, filename: string): string {
    const safe = path.basename(filename);
    if (!safe.endsWith('.sql.gz') || !safe.startsWith(`backup_${tenantId}_`)) {
      throw new BadRequestException(
        `Некорректное имя файла бэкапа: "${filename}"`,
      );
    }
    const filepath = path.join(this.getTenantBackupDir(tenantId), safe);
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException(`Бэкап "${filename}" не найден`);
    }
    return filepath;
  }

  /**
   * Восстановить базу данных тенанта из выбранного архива.
   * Устанавливает Redis-блокировку на всё время операции.
   */
  async restoreBackup(
    tenantId: string,
    filename: string,
  ): Promise<{ duration: number; statements: number }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Тенант "${tenantId}" не найден`);

    const filepath = this.getBackupFilePath(tenantId, filename);

    const locked = await this.acquireLock(tenantId);
    if (!locked) {
      throw new ConflictException(
        `Тенант "${tenantId}" занят другой операцией. Восстановление невозможно.`,
      );
    }

    const startTime = Date.now();
    this.logger.log(`🔄 [${tenantId}] Восстановление из "${filename}"...`);

    let connection: mysql.PoolConnection | null = null;
    try {
      const sqlContent = await this.decompressSql(filepath);
      const statements = this.parseSqlStatements(sqlContent);

      const pool = this.connectionManager.getPool(tenant);
      connection = await pool.getConnection();
      await connection.beginTransaction();

      let executed = 0;
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed || trimmed.startsWith('--')) continue;
        await connection.query(trimmed);
        executed++;
      }

      await connection.commit();
      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ [${tenantId}] Восстановление завершено за ${duration}ms (${executed} операций)`,
      );
      return { duration, statements: executed };
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch {
          /* ignore */
        }
      }
      this.logger.error(
        `❌ [${tenantId}] Ошибка при восстановлении из "${filename}":`,
        err,
      );
      throw err;
    } finally {
      if (connection) connection.release();
      await this.releaseLock(tenantId);
    }
  }

  /**
   * Удалить резервную копию.
   */
  async deleteBackup(tenantId: string, filename: string): Promise<void> {
    const filepath = this.getBackupFilePath(tenantId, filename);
    await fs.promises.unlink(filepath);
    this.logger.log(`🗑️ [${tenantId}] Бэкап "${filename}" удалён`);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  async computeSha256(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filepath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async decompressSql(filepath: string): Promise<string> {
    const chunks: Buffer[] = [];
    const readStream = fs.createReadStream(filepath);
    const gunzip = zlib.createGunzip();
    readStream.pipe(gunzip);
    for await (const chunk of gunzip) {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string),
      );
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  /**
   * Разобрать SQL-дамп на список statements, корректно обрабатывая строковые литералы.
   */
  parseSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let escape = false;
    let stringChar = '';

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      current += ch;

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (!inString && (ch === "'" || ch === '"' || ch === '`')) {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (inString && ch === stringChar) {
        inString = false;
        continue;
      }
      if (!inString && ch === ';') {
        const stmt = current.trim();
        if (stmt.length > 1) statements.push(stmt);
        current = '';
      }
    }

    const tail = current.trim();
    if (tail) statements.push(tail);
    return statements;
  }

  /**
   * Удалить бэкапы старше MAX_BACKUP_AGE_DAYS или сверх лимита MAX_BACKUPS.
   */
  async rotateOldBackups(tenantId: string): Promise<void> {
    await Promise.resolve();
    const dir = this.getTenantBackupDir(tenantId);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql.gz'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // новые первые

    const cutoff = new Date(
      Date.now() - MAX_BACKUP_AGE_DAYS * 24 * 60 * 60 * 1000,
    );
    let kept = 0;

    for (const file of files) {
      if (kept < MAX_BACKUPS && file.mtime > cutoff) {
        kept++;
      } else {
        fs.unlinkSync(path.join(dir, file.name));
        this.logger.log(`🗑️ [${tenantId}] Ротация: удалён "${file.name}"`);
      }
    }
  }
}
