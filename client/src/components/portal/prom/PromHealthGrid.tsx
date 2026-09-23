import React from 'react';
import { Database, Link2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { MariaDbStatus, PromStatus } from './types';

export interface PromHealthGridProps {
  mariadbStatus: MariaDbStatus;
  promStatus: PromStatus;
  hasApiKey: boolean;
  exportEnabled: boolean;
  syncInterval: number;
  onPingProm: () => void;
}

export const PromHealthGrid: React.FC<PromHealthGridProps> = ({
  mariadbStatus,
  promStatus,
  hasApiKey,
  exportEnabled,
  syncInterval,
  onPingProm,
}) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" id="health-grid-prom">
      {/* Индикатор 1: MariaDB */}
      <div className="health-card" id="health-mariadb-prom">
        <div className="health-card__icon text-indigo">
          <Database size={20} />
        </div>
        <div className="health-card__content">
          <div className="health-card__label">{t('healthMariaDb')}</div>
          <div className="health-card__status">
            {mariadbStatus.loading ? (
              <div className="flex items-center gap-1.5 text-muted">
                <Loader2 size={12} className="spinner" />
                <span>{t('loading')}</span>
              </div>
            ) : mariadbStatus.success ? (
              <div className="flex items-center gap-1.5 text-emerald">
                <span className="dot dot--emerald" />
                <span className="font-semibold">{t('statusConnected')}</span>
                {mariadbStatus.pingMs !== undefined && (
                  <span className="text-[11px] text-muted font-mono">
                    ({mariadbStatus.pingMs}ms)
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-rose">
                <span className="dot dot--rose" />
                <span className="font-semibold">{t('statusDisconnected')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Индикатор 2: Prom.ua API */}
      <div className="health-card" id="health-prom">
        <div className="health-card__icon text-sky">
          <Link2 size={20} />
        </div>
        <div className="health-card__content">
          <div className="health-card__label">{t('healthProm')}</div>
          <div className="health-card__status">
            {promStatus.loading ? (
              <div className="flex items-center gap-1.5 text-muted">
                <Loader2 size={12} className="spinner" />
                <span>{t('loading')}</span>
              </div>
            ) : promStatus.success ? (
              <div className="flex items-center gap-1.5 text-emerald">
                <span className="dot dot--emerald animate-pulse" />
                <span className="font-semibold">{t('statusAuthorized')}</span>
                {promStatus.shopTitle && (
                  <span className="text-[11px] text-muted truncate max-w-[120px]">
                    ({promStatus.shopTitle})
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-rose">
                <span className="dot dot--rose" />
                <span className="font-semibold">
                  {hasApiKey ? t('statusDisconnected') : t('availableForConnection')}
                </span>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--secondary btn--xs self-center"
          onClick={onPingProm}
          disabled={promStatus.loading || !hasApiKey}
          title={t('promTestConnection')}
        >
          <RefreshCw size={12} className={promStatus.loading ? 'spinner' : ''} />
          <span>{t('checkConnection')}</span>
        </button>
      </div>

      {/* Индикатор 3: Автосинхронизация */}
      <div className="health-card" id="health-prom-autosync">
        <div className="health-card__icon text-amber">
          <Clock size={20} />
        </div>
        <div className="health-card__content">
          <div className="health-card__label">{t('healthAutoSync')}</div>
          <div className="health-card__status">
            {exportEnabled ? (
              <div className="flex items-center gap-1.5 text-emerald">
                <span className="dot dot--emerald animate-pulse" />
                <span className="font-semibold">{t('statusEnabled')}</span>
                <span className="text-[11px] text-muted">({syncInterval} мин)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted">
                <span className="dot dot--grey" />
                <span>{t('statusDisabled')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
