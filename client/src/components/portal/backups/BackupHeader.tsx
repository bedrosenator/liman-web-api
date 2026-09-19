import React from 'react';
import {
  Database,
  RefreshCw,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { BackupReport } from './types';

interface BackupHeaderProps {
  isLoading: boolean;
  isCreating: 'fast' | 'full' | null;
  createReport: BackupReport | null;
  onRefresh: () => void;
  onCreate: (mode: 'fast' | 'full') => void;
}

export const BackupHeader: React.FC<BackupHeaderProps> = ({
  isLoading,
  isCreating,
  createReport,
  onRefresh,
  onCreate,
}) => {
  const { t, language } = useLanguage();

  return (
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
            onClick={onRefresh}
            disabled={isLoading}
            title={t('refresh')}
          >
            <RefreshCw size={14} className={isLoading ? 'spinner' : ''} />
            <span>{t('refresh')}</span>
          </button>

          <button
            type="button"
            className="btn btn--secondary btn--sm gap-1.5"
            onClick={() => onCreate('fast')}
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
            onClick={() => onCreate('full')}
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
  );
};
