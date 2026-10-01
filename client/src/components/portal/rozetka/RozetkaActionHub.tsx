import React from 'react';
import { Zap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { RozetkaSyncReport } from './types';

interface RozetkaActionHubProps {
  hasRozetkaClientId: boolean;
  isSyncing: boolean;
  syncReport: RozetkaSyncReport | null;
  onSyncPricesStocks: () => void;
}

export const RozetkaActionHub: React.FC<RozetkaActionHubProps> = ({
  hasRozetkaClientId,
  isSyncing,
  syncReport,
  onSyncPricesStocks,
}) => {
  const { t } = useLanguage();

  return (
    <div className="card" id="rozetka-action-hub">
      <div className="card__header">
        <h2 className="card__title">
          <Zap size={20} className="text-amber flex-shrink-0" />
          <span>{t('rozetkaActions')}</span>
        </h2>
      </div>
      <div className="card__body space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 bg-elevated rounded-lg border border-subtle">
          <div>
            <div className="text-sm font-semibold text-primary">
              {t('rozetkaSyncPricesStocks')}
            </div>
            <div className="text-xs text-muted">
              {t('rozetkaSyncPricesStocksDesc')}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--primary flex-shrink-0"
            onClick={onSyncPricesStocks}
            disabled={isSyncing || !hasRozetkaClientId}
          >
            {isSyncing ? (
              <Loader2 size={16} className="spinner" />
            ) : (
              <Zap size={16} />
            )}
            <span>{isSyncing ? t('syncInProgress') : t('rozetkaSyncPricesStocks')}</span>
          </button>
        </div>

        {syncReport && (
          <div
            className={`alert ${
              syncReport.success ? 'alert--success' : 'alert--danger'
            }`}
          >
            {syncReport.success ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{syncReport.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};
