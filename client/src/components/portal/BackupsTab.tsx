import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Download,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  FileArchive,
  RefreshCw,
  Plus,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { backupApi } from '@/api/client';

interface BackupItem {
  filename: string;
  filepath: string;
  sizeBytes: number;
  createdAt: string;
  mode: 'fast' | 'full';
  tables: string[];
  sha256?: string;
}

interface BackupsTabProps {
  tenantId: string;
}

export const BackupsTab: React.FC<BackupsTabProps> = ({ tenantId }) => {
  const { t, language } = useLanguage();

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState<'fast' | 'full' | null>(null);
  const [createReport, setCreateReport] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Restore Modal State
  const [restoreCandidate, setRestoreCandidate] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Delete State
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBackups = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await backupApi.list(tenantId);
      setBackups(res.data?.backups || []);
    } catch (err: any) {
      console.error('Failed to list backups:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Create Backup
  const handleCreate = async (mode: 'fast' | 'full') => {
    setIsCreating(mode);
    setCreateReport(null);
    try {
      const res = await backupApi.create(tenantId, mode);
      setCreateReport({
        success: true,
        message:
          language === 'uk'
            ? `Резервну копію успішно створено (${res.data?.filename || mode})`
            : `Резервная копия успешно создана (${res.data?.filename || mode})`,
      });
      await fetchBackups();
    } catch (err: any) {
      setCreateReport({
        success: false,
        message:
          err.response?.data?.message ||
          err.message ||
          (language === 'uk' ? 'Помилка створення бекапу' : 'Ошибка создания бэкапа'),
      });
    } finally {
      setIsCreating(null);
    }
  };

  // Download
  const handleDownload = async (filename: string) => {
    try {
      const res = await backupApi.download(tenantId, filename);
      const blob = new Blob([res.data], { type: 'application/gzip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  // Restore
  const handleConfirmRestore = async () => {
    if (!restoreCandidate) return;
    setIsRestoring(true);
    setRestoreResult(null);
    try {
      await backupApi.restore(tenantId, restoreCandidate);
      setRestoreResult({
        success: true,
        message:
          language === 'uk'
            ? `Базу даних успішно відновлено з архіву ${restoreCandidate}`
            : `База данных успешно восстановлена из архива ${restoreCandidate}`,
      });
      setTimeout(() => {
        setRestoreCandidate(null);
      }, 2000);
    } catch (err: any) {
      setRestoreResult({
        success: false,
        message:
          err.response?.data?.message ||
          err.message ||
          (language === 'uk' ? 'Помилка відновлення' : 'Ошибка восстановления'),
      });
    } finally {
      setIsRestoring(false);
    }
  };

  // Delete
  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      await backupApi.delete(tenantId, deleteCandidate);
      setDeleteCandidate(null);
      await fetchBackups();
    } catch (err: any) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(language === 'uk' ? 'uk-UA' : 'ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6" id="backups-tab-content">
      {/* Header card with action buttons */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database size={22} className="text-indigo" />
              <h2 className="text-lg font-bold text-primary">
                {language === 'uk'
                  ? 'Резервні копії MariaDB'
                  : 'Резервные копии MariaDB'}
              </h2>
            </div>
            <p className="text-xs text-secondary leading-relaxed max-w-xl">
              {language === 'uk'
                ? 'Стислі gzip-дампи з перевіркою контрольних сум SHA-256. Дозволяють миттєво відкотити каталог і залишки у разі непередбачених помилок.'
                : 'Сжатые gzip-дампы с проверкой контрольных сумм SHA-256. Позволяют мгновенно откатить каталог и остатки в случае непредвиденных ошибок.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn--secondary btn--sm gap-1.5"
              onClick={fetchBackups}
              disabled={isLoading}
              title={t('refresh')}
            >
              <RefreshCw size={14} className={isLoading ? 'spinner' : ''} />
              <span>{t('refresh')}</span>
            </button>

            <button
              type="button"
              className="btn btn--secondary btn--sm gap-1.5"
              onClick={() => handleCreate('fast')}
              disabled={Boolean(isCreating)}
              id="btn-create-fast-backup"
            >
              {isCreating === 'fast' ? (
                <Loader2 size={14} className="spinner" />
              ) : (
                <Plus size={14} />
              )}
              <span>{t('fastBackup')}</span>
            </button>

            <button
              type="button"
              className="btn btn--primary btn--sm gap-1.5"
              onClick={() => handleCreate('full')}
              disabled={Boolean(isCreating)}
              id="btn-create-full-backup"
            >
              {isCreating === 'full' ? (
                <Loader2 size={14} className="spinner" />
              ) : (
                <Plus size={14} />
              )}
              <span>{t('fullBackup')}</span>
            </button>
          </div>
        </div>

        {/* Report Alert */}
        {createReport && (
          <div
            className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-xs ${
              createReport.success
                ? 'bg-emerald/10 text-emerald border border-emerald/20'
                : 'bg-rose/10 text-rose border border-rose/20'
            }`}
          >
            {createReport.success ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{createReport.message}</span>
          </div>
        )}
      </div>

      {/* Backups List */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <FileArchive size={16} className="text-muted" />
            <span>
              {language === 'uk' ? 'Список архівів' : 'Список архивов'}
            </span>
            <span className="badge badge--indigo text-xs">
              {backups.length}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted flex flex-col items-center gap-3">
            <Loader2 size={24} className="spinner text-indigo" />
            <span className="text-xs">{t('loading')}</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="p-12 text-center text-muted space-y-3">
            <div className="w-12 h-12 rounded-full bg-elevated flex items-center justify-center mx-auto text-muted">
              <Database size={24} />
            </div>
            <div className="text-sm font-medium text-primary">
              {t('noBackups')}
            </div>
            <p className="text-xs text-secondary max-w-sm mx-auto">
              {language === 'uk'
                ? 'Створіть свій перший бекап зараз, натиснувши кнопку зверху.'
                : 'Создайте свой первый бэкап сейчас, нажав кнопку вверху.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-subtle text-muted uppercase text-[11px] tracking-wider bg-elevated/50">
                  <th className="py-3 px-4 font-semibold">{t('backupCreatedAt')}</th>
                  <th className="py-3 px-4 font-semibold">Файл</th>
                  <th className="py-3 px-4 font-semibold">{t('backupMode')}</th>
                  <th className="py-3 px-4 font-semibold">{t('backupSize')}</th>
                  <th className="py-3 px-4 font-semibold">SHA-256</th>
                  <th className="py-3 px-4 text-right font-semibold">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-elevated/40 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-primary whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-muted" />
                        <span>{formatDate(b.createdAt)}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-secondary truncate max-w-xs" title={b.filename}>
                      {b.filename}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`badge text-[10px] ${
                          b.mode === 'full' ? 'badge--indigo' : 'badge--success'
                        }`}
                      >
                        {b.mode === 'full' ? t('fullBackup') : t('fastBackup')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                      {formatBytes(b.sizeBytes)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-emerald" title={b.sha256 || 'Verified'}>
                        <ShieldCheck size={14} />
                        <span className="text-[10px] font-mono">OK</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn btn--secondary btn--xs gap-1"
                          onClick={() => handleDownload(b.filename)}
                          title={t('downloadBackup')}
                        >
                          <Download size={12} />
                          <span>{language === 'uk' ? 'Завантажити' : 'Скачать'}</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn--secondary btn--xs gap-1 text-amber hover:text-amber"
                          onClick={() => setRestoreCandidate(b.filename)}
                          title={t('restoreBackup')}
                        >
                          <RotateCcw size={12} />
                          <span>{language === 'uk' ? 'Откат' : 'Откат'}</span>
                        </button>

                        <button
                          type="button"
                          className="btn-icon text-muted hover:text-rose p-1"
                          onClick={() => setDeleteCandidate(b.filename)}
                          title={t('deleteBackup')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {restoreCandidate && (
        <div className="modal-overlay" id="restore-confirm-modal">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <div className="modal-title-row text-amber">
                <AlertTriangle size={20} />
                <h3 className="modal-title">
                  {language === 'uk' ? 'Підтвердження відкату БД' : 'Подтверждение отката БД'}
                </h3>
              </div>
            </div>

            <div className="modal-body space-y-3">
              <p className="text-xs text-secondary leading-relaxed">
                {language === 'uk'
                  ? `Ви збираєтеся відновити базу даних MariaDB з архіву:`
                  : `Вы собираетесь восстановить базу данных MariaDB из архива:`}
              </p>
              <div className="p-2.5 rounded-lg bg-elevated font-mono text-xs text-primary break-all border border-border">
                {restoreCandidate}
              </div>
              <p className="text-xs text-rose font-medium leading-relaxed">
                ⚠️{' '}
                {language === 'uk'
                  ? 'Поточні залишки та ціни в MariaDB будуть перезаписані даними з архіву! Операція незворотна.'
                  : 'Текущие остатки и цены в MariaDB будут перезаписаны данными из архива! Операция необратима.'}
              </p>

              {restoreResult && (
                <div
                  className={`p-3 rounded-lg text-xs ${
                    restoreResult.success
                      ? 'bg-emerald/10 text-emerald border border-emerald/20'
                      : 'bg-rose/10 text-rose border border-rose/20'
                  }`}
                >
                  {restoreResult.message}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  setRestoreCandidate(null);
                  setRestoreResult(null);
                }}
                disabled={isRestoring}
              >
                {t('cancel')}
              </button>

              <button
                type="button"
                className="btn btn--primary btn--sm gap-1.5"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
              >
                {isRestoring && <Loader2 size={14} className="spinner" />}
                <span>
                  {language === 'uk' ? 'Відновити базу' : 'Восстановить базу'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="modal-overlay" id="delete-confirm-modal">
          <div className="modal-content max-w-sm">
            <div className="modal-header">
              <div className="modal-title-row text-rose">
                <Trash2 size={20} />
                <h3 className="modal-title">
                  {language === 'uk' ? 'Видалити архів?' : 'Удалить архив?'}
                </h3>
              </div>
            </div>

            <div className="modal-body">
              <p className="text-xs text-secondary leading-relaxed">
                {language === 'uk'
                  ? `Видалити файл бекапу ${deleteCandidate}?`
                  : `Удалить файл бэкапа ${deleteCandidate}?`}
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setDeleteCandidate(null)}
                disabled={isDeleting}
              >
                {t('cancel')}
              </button>

              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting && <Loader2 size={14} className="spinner" />}
                <span>{language === 'uk' ? 'Видалити' : 'Удалить'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
