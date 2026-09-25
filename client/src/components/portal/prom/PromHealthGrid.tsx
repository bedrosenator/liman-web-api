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
    <div className="health-grid mb-6" id="health-grid-prom">
      {/* Индикатор 1: MariaDB */}
      <div className="health-card" id="health-mariadb-prom">
        <div className="health-card__icon">
          <Database size={22} className="text-indigo" />
        </div>
        <div className="health-card__info">
          <div className="health-card__label">{t('healthMariaDb')}</div>
          <div className="health-card__status">
            {mariadbStatus.loading ? (
              <>
                <Loader2 size={12} className="spinner text-muted" />
                <span>{t('loading')}</span>
              </>
            ) : mariadbStatus.success ? (
              <>
                <span className="status-dot status-dot--green" />
                <span className="text-emerald font-semibold">{t('statusConnected')}</span>
                {mariadbStatus.pingMs !== undefined && (
                  <span className="text-xs text-muted font-mono">({mariadbStatus.pingMs}ms)</span>
                )}
              </>
            ) : (
              <>
                <span className="status-dot status-dot--red" />
                <span className="text-rose font-semibold">{t('statusDisconnected')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Индикатор 2: Prom.ua API */}
      <div className="health-card" id="health-prom">
        <div className="health-card__icon">
          <Link2 size={22} className="text-sky" />
        </div>
        <div className="health-card__info">
          <div className="health-card__label">{t('healthProm')}</div>
          <div className="health-card__status">
            {promStatus.loading ? (
              <>
                <Loader2 size={12} className="spinner text-muted" />
                <span>{t('loading')}</span>
              </>
            ) : promStatus.success ? (
              <>
                <span className="status-dot status-dot--green" />
                <span className="text-emerald font-semibold">{t('statusAuthorized')}</span>
                {promStatus.shopTitle && (
                  <span
                    className="text-xs text-muted truncate font-mono min-w-0"
                    style={{ maxWidth: '120px' }}
                    title={promStatus.shopTitle}
                  >
                    ({promStatus.shopTitle})
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="status-dot status-dot--red" />
                <span className="text-rose font-semibold truncate min-w-0">
                  {hasApiKey ? t('statusUnauthorized') : t('availableForConnection')}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn-icon btn-icon--sm ml-auto self-center shrink-0"
          onClick={onPingProm}
          disabled={promStatus.loading || !hasApiKey}
          title={t('promTestConnection')}
          aria-label={t('checkConnection')}
        >
          <RefreshCw size={14} className={promStatus.loading ? 'spinner' : ''} />
        </button>
      </div>

      {/* Индикатор 3: Автосинхронизация */}
      <div className="health-card" id="health-prom-autosync">
        <div className="health-card__icon">
          <Clock size={22} className="text-amber" />
        </div>
        <div className="health-card__info">
          <div className="health-card__label">{t('healthAutoSync')}</div>
          <div className="health-card__status">
            {exportEnabled ? (
              <>
                <span className="status-dot status-dot--green" />
                <span className="text-emerald font-semibold">{t('statusEnabled')}</span>
                <span className="text-xs text-muted">({syncInterval} мин)</span>
              </>
            ) : (
              <>
                <span className="status-dot status-dot--grey" />
                <span className="text-muted">{t('statusDisabled')}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

