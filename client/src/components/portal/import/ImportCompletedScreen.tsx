import React from 'react';
import {
  CheckCircle2,
  Layers,
  Sparkles,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { StatBox } from '../common';
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
          <StatBox
            icon={Layers}
            iconColor="text-indigo"
            label={t('importProgress')}
            value={stats.totalFetched ?? 0}
          />

          <StatBox
            icon={Sparkles}
            iconColor="text-emerald"
            label={t('importCreated')}
            value={stats.created ?? 0}
            valueColor="text-emerald"
          />

          <StatBox
            icon={RefreshCw}
            iconColor="text-sky"
            label={t('importUpdated')}
            value={stats.updated ?? 0}
            valueColor="text-sky"
          />

          <StatBox
            icon={AlertTriangle}
            iconColor="text-amber"
            label={language === 'uk' ? 'Пропущено' : 'Пропущено'}
            value={stats.skipped ?? 0}
            valueColor="text-amber"
          />
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
