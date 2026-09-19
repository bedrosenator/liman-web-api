import React from 'react';
import {
  FileArchive,
  Database,
  Loader2,
  Clock,
  ShieldCheck,
  Download,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { BackupItem } from './types';

interface BackupsTableProps {
  backups: BackupItem[];
  isLoading: boolean;
  onDownload: (filename: string) => void;
  onSelectRestore: (filename: string) => void;
  onSelectDelete: (filename: string) => void;
}

export const BackupsTable: React.FC<BackupsTableProps> = ({
  backups,
  isLoading,
  onDownload,
  onSelectRestore,
  onSelectDelete,
}) => {
  const { t, language } = useLanguage();

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
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <FileArchive size={16} className="text-muted" />
          <span>
            {language === 'uk' ? 'Список архівів' : 'Список архивов'}
          </span>
          <span className="badge badge--indigo text-xs">{backups.length}</span>
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
        <div className="table-wrapper">
          <table className="table" id="backups-list-table">
            <thead>
              <tr>
                <th style={{ width: '190px' }}>{t('backupCreatedAt')}</th>
                <th>Файл</th>
                <th className="text-center" style={{ width: '160px' }}>{t('backupMode')}</th>
                <th style={{ width: '120px' }}>{t('backupSize')}</th>
                <th className="text-center" style={{ width: '100px' }}>SHA-256</th>
                <th className="text-right" style={{ width: '220px' }}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.filename}>
                  <td className="whitespace-nowrap font-medium text-primary">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-muted" />
                      <span>{formatDate(b.createdAt)}</span>
                    </div>
                  </td>
                  <td
                    className="font-mono text-secondary truncate max-w-xs"
                    title={b.filename}
                  >
                    {b.filename}
                  </td>
                  <td className="text-center whitespace-nowrap">
                    <span
                      className={`badge ${
                        b.mode === 'full' ? 'badge--indigo' : 'badge--emerald'
                      }`}
                    >
                      {b.mode === 'full' ? t('fullBackup') : t('fastBackup')}
                    </span>
                  </td>
                  <td className="font-mono whitespace-nowrap text-secondary">
                    {formatBytes(b.sizeBytes)}
                  </td>
                  <td className="text-center whitespace-nowrap">
                    <div
                      className="inline-flex items-center gap-1.5 text-emerald"
                      title={b.sha256 || 'Verified'}
                    >
                      <ShieldCheck size={14} />
                      <span className="text-xs font-mono font-semibold">OK</span>
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        className="btn btn--secondary btn--xs gap-1"
                        onClick={() => onDownload(b.filename)}
                        title={t('downloadBackup')}
                      >
                        <Download size={12} />
                        <span>
                          {language === 'uk' ? 'Завантажити' : 'Скачать'}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="btn btn--secondary btn--xs gap-1 text-amber hover:text-amber"
                        onClick={() => onSelectRestore(b.filename)}
                        title={t('restoreBackup')}
                      >
                        <RotateCcw size={12} />
                        <span>{language === 'uk' ? 'Откат' : 'Откат'}</span>
                      </button>

                      <button
                        type="button"
                        className="btn-icon text-muted hover:text-rose p-1"
                        onClick={() => onSelectDelete(b.filename)}
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
  );
};
