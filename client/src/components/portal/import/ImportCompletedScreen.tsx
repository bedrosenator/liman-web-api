import React from 'react';
import {
  CheckCircle2,
  Layers,
  Sparkles,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { ImportStats } from './types';

interface ImportCompletedScreenProps {
  stats: ImportStats | null;
}

export const ImportCompletedScreen: React.FC<ImportCompletedScreenProps> = ({
  stats,
}) => {
  const { t, language } = useLanguage();

  return (
    <div className="py-2 space-y-5 text-center" id="import-completed-box">
      <div className="success-badge-glow">
        <CheckCircle2 size={36} className="text-emerald" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-primary">
          {language === 'uk' ? 'Імпорт каталогу успішно завершено!' : 'Импорт каталога успешно завершен!'}
        </h3>
        <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
          {language === 'uk'
            ? 'Товари з магазину Хорошоп синхронізовані в MariaDB Limansoft.'
            : 'Товары из магазина Хорошоп синхронизированы в MariaDB Limansoft.'}
        </p>
      </div>

      {stats && (
        <div className="stat-grid">
          <div className="stat-box">
            <div className="stat-box__header">
              <Layers size={13} className="text-indigo" />
              <span className="stat-box__label">{t('importProgress')}</span>
            </div>
            <div className="stat-box__value">{stats.totalFetched ?? 0}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box__header">
              <Sparkles size={13} className="text-emerald" />
              <span className="stat-box__label">{t('importCreated')}</span>
            </div>
            <div className="stat-box__value text-emerald">{stats.created ?? 0}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box__header">
              <RefreshCw size={13} className="text-sky" />
              <span className="stat-box__label">{t('importUpdated')}</span>
            </div>
            <div className="stat-box__value text-sky">{stats.updated ?? 0}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box__header">
              <AlertTriangle size={13} className="text-amber" />
              <span className="stat-box__label">
                {language === 'uk' ? 'Пропущено' : 'Пропущено'}
              </span>
            </div>
            <div className="stat-box__value text-amber">{stats.skipped ?? 0}</div>
          </div>
        </div>
      )}

      {stats?.backupId && (
        <div className="duration-pill">
          <span>🛡️ {language === 'uk' ? 'Бекап:' : 'Бэкап:'} {stats.backupId}</span>
        </div>
      )}
    </div>
  );
};
