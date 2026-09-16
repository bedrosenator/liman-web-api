import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { BackupService, BackupMode, BackupMeta } from './backup.service';
import * as fs from 'node:fs';
import * as path from 'node:path';

class CreateBackupDto {
  mode?: BackupMode;
}

class RestoreBackupDto {
  /** Подтверждение операции — пользователь осознаёт риск перезаписи базы */
  confirmed!: boolean;
}

@ApiTags('Backup & Restore')
@Controller('api/v1/liman/:tenantId/backups')
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(private readonly backupService: BackupService) {}

  /**
   * POST /api/v1/liman/:tenantId/backups
   * Создать резервную копию базы данных.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Создать резервную копию БД тенанта',
    description:
      'Режим `fast`: без BLOB-фото (~5–15 МБ, 1–2 сек). Режим `full`: полный архив с фото (асинхронно).',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiBody({ schema: { example: { mode: 'fast' } } })
  @ApiResponse({ status: 201, description: 'Бэкап создан' })
  @ApiResponse({ status: 404, description: 'Тенант не найден' })
  @ApiResponse({ status: 409, description: 'Тенант занят другой операцией' })
  async createBackup(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateBackupDto,
  ): Promise<BackupMeta> {
    const mode: BackupMode = dto.mode === 'full' ? 'full' : 'fast';
    this.logger.log(
      `📥 POST /backups — тенант "${tenantId}", режим: "${mode}"`,
    );
    return this.backupService.createBackup(tenantId, mode);
  }

  /**
   * GET /api/v1/liman/:tenantId/backups
   * Получить список резервных копий.
   */
  @Get()
  @ApiOperation({ summary: 'Список резервных копий тенанта' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiResponse({ status: 200, description: 'Список бэкапов (новые первые)' })
  async listBackups(@Param('tenantId') tenantId: string): Promise<{
    tenantId: string;
    count: number;
    backups: BackupMeta[];
  }> {
    const backups = await this.backupService.listBackups(tenantId);
    return { tenantId, count: backups.length, backups };
  }

  /**
   * GET /api/v1/liman/:tenantId/backups/:filename/download
   * Скачать архив резервной копии.
   */
  @Get(':filename/download')
  @ApiOperation({ summary: 'Скачать файл резервной копии (.sql.gz)' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiParam({
    name: 'filename',
    example: 'backup_columb_2026-09-16_09-00-00_fast.sql.gz',
  })
  downloadBackup(
    @Param('tenantId') tenantId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): void {
    const filepath = this.backupService.getBackupFilePath(tenantId, filename);
    const stat = fs.statSync(filepath);
    const safeName = path.basename(filepath);

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', String(stat.size));

    const stream = fs.createReadStream(filepath);
    stream.pipe(res);

    this.logger.log(
      `📤 [${tenantId}] Скачивание бэкапа "${safeName}" (${stat.size} байт)`,
    );
  }

  /**
   * POST /api/v1/liman/:tenantId/backups/:filename/restore
   * Восстановить базу данных из архива.
   */
  @Post(':filename/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Восстановить БД тенанта из резервной копии (Rollback)',
    description:
      '⚠️ DANGER: Текущее состояние базы будет перезаписано. ' +
      'Требует подтверждения через поле `confirmed: true` в теле запроса.',
  })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiParam({
    name: 'filename',
    example: 'backup_columb_2026-09-16_09-00-00_fast.sql.gz',
  })
  @ApiBody({ schema: { example: { confirmed: true } } })
  @ApiResponse({ status: 200, description: 'База успешно восстановлена' })
  @ApiResponse({
    status: 400,
    description: 'Требуется подтверждение (confirmed: true)',
  })
  @ApiResponse({ status: 409, description: 'Тенант занят другой операцией' })
  async restoreBackup(
    @Param('tenantId') tenantId: string,
    @Param('filename') filename: string,
    @Body() dto: RestoreBackupDto,
  ): Promise<{
    success: boolean;
    message: string;
    duration: number;
    statements: number;
  }> {
    if (!dto.confirmed) {
      return {
        success: false,
        message:
          'Операция восстановления требует явного подтверждения: передайте `confirmed: true` в теле запроса.',
        duration: 0,
        statements: 0,
      };
    }

    this.logger.warn(
      `⚠️ [${tenantId}] Запрос на восстановление из "${filename}"`,
    );
    const result = await this.backupService.restoreBackup(tenantId, filename);

    return {
      success: true,
      message: `База данных тенанта "${tenantId}" успешно восстановлена из "${filename}"`,
      duration: result.duration,
      statements: result.statements,
    };
  }

  /**
   * DELETE /api/v1/liman/:tenantId/backups/:filename
   * Удалить резервную копию.
   */
  @Delete(':filename')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить файл резервной копии' })
  @ApiParam({ name: 'tenantId', example: 'columb' })
  @ApiParam({
    name: 'filename',
    example: 'backup_columb_2026-09-16_09-00-00_fast.sql.gz',
  })
  @ApiResponse({ status: 200, description: 'Бэкап удалён' })
  async deleteBackup(
    @Param('tenantId') tenantId: string,
    @Param('filename') filename: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.backupService.deleteBackup(tenantId, filename);
    return {
      success: true,
      message: `Резервная копия "${filename}" удалена`,
    };
  }
}
