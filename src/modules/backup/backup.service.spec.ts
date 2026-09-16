import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  BackupService,
  BACKUP_REDIS_CLIENT,
  FAST_BACKUP_TABLES,
} from './backup.service';
import { Tenant } from '../tenant/tenant.entity';
import { TenantConnectionManager } from '../liman/tenant-connection-manager.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockTenant = (): Tenant => {
  const t = new Tenant();
  t.id = 'test-tenant';
  t.name = 'Test Shop';
  t.dbHost = '127.0.0.1';
  t.dbPort = 3306;
  t.dbName = 'testDB';
  t.dbUser = 'root';
  t.dbPassword = 'secret';
  t.isActive = true;
  t.priceColumn = 'cena2';
  t.stockColumn = 'skl_k';
  t.syncIntervalMinutes = 15;
  t.promExportEnabled = false;
  t.woocommerceSyncEnabled = false;
  t.woocommerceImportEnabled = false;
  t.woocommerceSyncIntervalMinutes = 15;
  t.rozetkaExportEnabled = false;
  t.horoshopExportEnabled = false;
  t.horoshopSyncIntervalMinutes = 15;
  t.createdAt = new Date();
  t.updatedAt = new Date();
  return t;
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeRedisMock = () => ({
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
});

const makeConnectionManagerMock = (
  queryResults: Record<string, unknown[][]> = {},
) => ({
  getPool: jest.fn().mockReturnValue({
    query: jest.fn().mockImplementation((sql: string) => {
      // Маршрутизация по фрагменту SQL
      for (const [key, result] of Object.entries(queryResults)) {
        if (sql.includes(key)) return Promise.resolve(result);
      }
      return Promise.resolve([[]]);
    }),
    getConnection: jest.fn().mockResolvedValue({
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([[], []]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    }),
  }),
});

const makeTenantRepoMock = (tenant?: Tenant) => ({
  findOne: jest.fn().mockResolvedValue(tenant ?? mockTenant()),
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('BackupService', () => {
  let service: BackupService;
  let redisMock: ReturnType<typeof makeRedisMock>;
  let connMgrMock: ReturnType<typeof makeConnectionManagerMock>;
  let tenantRepoMock: ReturnType<typeof makeTenantRepoMock>;
  let tmpDir: string;

  beforeEach(async () => {
    // Создаём временную директорию для бэкапов
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liman-backup-test-'));
    redisMock = makeRedisMock();
    connMgrMock = makeConnectionManagerMock({
      'SHOW CREATE TABLE': [
        [{ 'Create Table': 'CREATE TABLE `name2` (`tcod` int NOT NULL)' }],
      ],
      'SELECT COUNT': [[{ cnt: 42 }]],
      'SELECT *': [[]], // Пустые данные — нет вставок
    });
    tenantRepoMock = makeTenantRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepoMock },
        { provide: TenantConnectionManager, useValue: connMgrMock },
        { provide: BACKUP_REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
    // Переопределяем базовую директорию бэкапов на временную
    (service as unknown as { backupsBaseDir: string }).backupsBaseDir = tmpDir;
  });

  afterEach(() => {
    // Очищаем временную директорию
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── acquireLock / releaseLock ─────────────────────────────────────────────

  describe('Redis Locking', () => {
    it('должен захватывать лок когда Redis возвращает OK', async () => {
      redisMock.set.mockResolvedValue('OK');
      const result = await service.acquireLock('tenant-1');
      expect(result).toBe(true);
      expect(redisMock.set).toHaveBeenCalledWith(
        'lock:tenant:tenant-1:busy',
        'backup',
        'PX',
        expect.any(Number),
        'NX',
      );
    });

    it('должен возвращать false когда лок уже занят (Redis возвращает null)', async () => {
      redisMock.set.mockResolvedValue(null);
      const result = await service.acquireLock('tenant-1');
      expect(result).toBe(false);
    });

    it('должен освобождать лок через del', async () => {
      await service.releaseLock('tenant-1');
      expect(redisMock.del).toHaveBeenCalledWith('lock:tenant:tenant-1:busy');
    });

    it('isLocked() должен возвращать true когда лок установлен', async () => {
      redisMock.get.mockResolvedValue('backup');
      expect(await service.isLocked('tenant-1')).toBe(true);
    });

    it('isLocked() должен возвращать false когда лок свободен', async () => {
      redisMock.get.mockResolvedValue(null);
      expect(await service.isLocked('tenant-1')).toBe(false);
    });
  });

  // ─── createBackup ──────────────────────────────────────────────────────────

  describe('createBackup()', () => {
    it('должен выбросить NotFoundException для несуществующего тенанта', async () => {
      tenantRepoMock.findOne.mockResolvedValue(null);
      await expect(
        service.createBackup('no-such-tenant', 'fast'),
      ).rejects.toThrow(NotFoundException);
    });

    it('должен выбросить ConflictException когда Redis лок занят', async () => {
      redisMock.set.mockResolvedValue(null); // лок занят
      await expect(service.createBackup('test-tenant', 'fast')).rejects.toThrow(
        ConflictException,
      );
    });

    it('должен создавать .sql.gz файл в директории бэкапов', async () => {
      const meta = await service.createBackup('test-tenant', 'fast');

      expect(meta.filename).toMatch(/^backup_test-tenant_.*_fast\.sql\.gz$/);
      expect(meta.mode).toBe('fast');
      expect(meta.sizeBytes).toBeGreaterThan(0);
      expect(meta.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(meta.skuCount).toBe(42);

      // Файл должен существовать на диске
      const dir = service.getTenantBackupDir('test-tenant');
      const filepath = path.join(dir, meta.filename);
      expect(fs.existsSync(filepath)).toBe(true);
    });

    it('должен использовать только FAST_BACKUP_TABLES в режиме fast', async () => {
      await service.createBackup('test-tenant', 'fast');
      const pool = connMgrMock.getPool.mock.results[0]?.value as {
        query: jest.Mock;
      };
      const calls = pool.query.mock.calls as string[][];

      // Запросы SHOW CREATE TABLE должны быть только для fast таблиц
      const showCalls = calls
        .filter((c) => c[0]?.toString().includes('SHOW CREATE TABLE'))
        .map((c) => c[0]?.toString());

      for (const table of FAST_BACKUP_TABLES) {
        expect(showCalls.some((s) => s?.includes(table))).toBe(true);
      }
      // namedesc не должна быть в fast режиме
      expect(showCalls.some((s) => s?.includes('namedesc'))).toBe(false);
    });

    it('должен включать namedesc в режиме full', async () => {
      await service.createBackup('test-tenant', 'full');
      const pool = connMgrMock.getPool.mock.results[0]?.value as {
        query: jest.Mock;
      };
      const calls = pool.query.mock.calls as string[][];
      const showCalls = calls
        .filter((c) => c[0]?.toString().includes('SHOW CREATE TABLE'))
        .map((c) => c[0]?.toString());
      expect(showCalls.some((s) => s?.includes('namedesc'))).toBe(true);
    });

    it('должен освобождать Redis лок даже при ошибке', async () => {
      connMgrMock.getPool.mockImplementation(() => {
        throw new Error('DB connection error');
      });

      await expect(
        service.createBackup('test-tenant', 'fast'),
      ).rejects.toThrow();
      expect(redisMock.del).toHaveBeenCalledWith(
        'lock:tenant:test-tenant:busy',
      );
    });

    it('должен захватывать и освобождать Redis лок при успехе', async () => {
      await service.createBackup('test-tenant', 'fast');
      expect(redisMock.set).toHaveBeenCalledTimes(1); // acquireLock
      expect(redisMock.del).toHaveBeenCalledTimes(1); // releaseLock
    });
  });

  // ─── listBackups ───────────────────────────────────────────────────────────

  describe('listBackups()', () => {
    it('должен возвращать пустой список если нет бэкапов', async () => {
      const list = await service.listBackups('test-tenant');
      expect(list).toEqual([]);
    });

    it('должен возвращать список созданных бэкапов (новые первые)', async () => {
      // Создаём первый бэкап
      const meta1 = await service.createBackup('test-tenant', 'fast');
      // Разные временные метки — вручную ставим mtime
      const dir = service.getTenantBackupDir('test-tenant');
      const fp1 = path.join(dir, meta1.filename);
      const olderTime = new Date(Date.now() - 5000);
      fs.utimesSync(fp1, olderTime, olderTime);

      await service.createBackup('test-tenant', 'fast');

      const list = await service.listBackups('test-tenant');
      expect(list.length).toBe(2);
      // Новый первый
      expect(new Date(list[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(list[1].createdAt).getTime(),
      );
    });
  });

  // ─── getBackupFilePath ─────────────────────────────────────────────────────

  describe('getBackupFilePath()', () => {
    it('должен выбрасывать BadRequestException для некорректного имени файла', () => {
      expect(() =>
        service.getBackupFilePath('test-tenant', '../etc/passwd'),
      ).toThrow('Некорректное имя файла бэкапа');
    });

    it('должен выбрасывать NotFoundException если файл не существует', () => {
      expect(() =>
        service.getBackupFilePath(
          'test-tenant',
          'backup_test-tenant_2099-01-01_00-00-00_fast.sql.gz',
        ),
      ).toThrow(NotFoundException);
    });

    it('должен возвращать абсолютный путь к файлу если он существует', async () => {
      const meta = await service.createBackup('test-tenant', 'fast');
      const filepath = service.getBackupFilePath('test-tenant', meta.filename);
      expect(path.isAbsolute(filepath)).toBe(true);
      expect(fs.existsSync(filepath)).toBe(true);
    });
  });

  // ─── parseSqlStatements ───────────────────────────────────────────────────

  describe('parseSqlStatements()', () => {
    it('должен корректно разбивать простые SQL-операции', () => {
      const sql = `DROP TABLE IF EXISTS \`t\`; CREATE TABLE \`t\` (id int); INSERT INTO \`t\` VALUES (1);`;
      const stmts = service.parseSqlStatements(sql);
      expect(stmts).toHaveLength(3);
      expect(stmts[0]).toContain('DROP TABLE');
      expect(stmts[1]).toContain('CREATE TABLE');
      expect(stmts[2]).toContain('INSERT');
    });

    it('должен не разбивать на ; внутри строк', () => {
      const sql = `INSERT INTO \`t\` VALUES ('val;ue');`;
      const stmts = service.parseSqlStatements(sql);
      expect(stmts).toHaveLength(1);
      expect(stmts[0]).toContain("'val;ue'");
    });

    it('должен пропускать пустые statements', () => {
      const sql = `;;; SELECT 1;`;
      const stmts = service.parseSqlStatements(sql);
      // Только SELECT должен остаться
      expect(stmts.filter((s) => s.trim().length > 1)).toHaveLength(1);
    });
  });

  // ─── rotateOldBackups ─────────────────────────────────────────────────────

  describe('rotateOldBackups()', () => {
    it('должен удалять файлы сверх лимита MAX_BACKUPS (10)', async () => {
      const dir = service.getTenantBackupDir('test-tenant');

      // Создаём 12 фиктивных файлов бэкапа с разными временными метками
      for (let i = 0; i < 12; i++) {
        const ts = new Date(Date.now() - i * 1000)
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19);
        const filepath = path.join(dir, `backup_test-tenant_${ts}_fast.sql.gz`);
        fs.writeFileSync(filepath, 'dummy');
        // Устанавливаем mtime чтобы сортировка работала корректно
        const mt = new Date(Date.now() - i * 1000);
        fs.utimesSync(filepath, mt, mt);
      }

      expect(fs.readdirSync(dir).length).toBe(12);
      await service.rotateOldBackups('test-tenant');
      expect(fs.readdirSync(dir).length).toBeLessThanOrEqual(10);
    });
  });

  // ─── deleteBackup ─────────────────────────────────────────────────────────

  describe('deleteBackup()', () => {
    it('должен удалять файл бэкапа', async () => {
      const meta = await service.createBackup('test-tenant', 'fast');
      const dir = service.getTenantBackupDir('test-tenant');
      const filepath = path.join(dir, meta.filename);
      expect(fs.existsSync(filepath)).toBe(true);

      await service.deleteBackup('test-tenant', meta.filename);
      expect(fs.existsSync(filepath)).toBe(false);
    });
  });

  // ─── restoreBackup ────────────────────────────────────────────────────────

  describe('restoreBackup()', () => {
    it('должен выбросить ConflictException когда Redis лок занят', async () => {
      // Создаём реальный файл бэкапа чтобы пройти валидацию файла
      const meta = await service.createBackup('test-tenant', 'fast');
      // Теперь блокируем Redis
      redisMock.set.mockResolvedValue(null);
      await expect(
        service.restoreBackup('test-tenant', meta.filename),
      ).rejects.toThrow(ConflictException);
    });

    it('должен выбросить NotFoundException для несуществующего тенанта', async () => {
      tenantRepoMock.findOne.mockResolvedValue(null);
      await expect(
        service.restoreBackup(
          'no-such',
          'backup_no-such_2099-01-01_00-00-00_fast.sql.gz',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
