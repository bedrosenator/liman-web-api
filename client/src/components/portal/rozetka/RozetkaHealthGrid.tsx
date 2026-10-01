import React from 'react';
import { RefreshCw, Radio, Zap, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { RozetkaPingStatus } from './types';

interface RozetkaHealthGridProps {
  pingStatus: RozetkaPingStatus;
  hasRozetkaClientId: boolean;
  exportEnabled: boolean;
  onPing: () => void;
}

export const RozetkaHealthGrid: React.FC<RozetkaHealthGridProps> = ({
  pingStatus,
  hasRozetkaClientId,
  exportEnabled,
  onPing,
}) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Светофор подключения Rozetka */}
      <div className="health-card" id="health-rozetka">
        <div className="health-card__icon text-emerald">
          <Radio size={20} />
        </div>
        <div className="health-card__content">
          <div className="health-card__label">Rozetka Seller API</div>
          {pingStatus.loading ? (
            <div className="health-card__status text-muted flex items-center gap-1.5">
              <Loader2 size={13} className="spinner" />
              <span>{t('loading')}</span>
            </div>
          ) : pingStatus.success ? (
            <div className="health-card__status text-emerald flex items-center gap-1.5">
              <span className="dot dot--emerald animate-pulse" />
              <span>{t('statusAuthorized')}</span>
            </div>
          ) : (
            <div className="health-card__status text-rose flex items-center gap-1.5">
              <span className="dot dot--rose" />
              <span>
                {hasRozetkaClientId ? t('statusDisconnected') : t('availableForConnection')}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn-icon btn-icon--sm ml-auto self-center shrink-0"
          onClick={onPing}
          disabled={pingStatus.loading || !hasRozetkaClientId}
          title={t('rozetkaTestConnection')}
          aria-label={t('checkConnection')}
        >
          <RefreshCw size={14} className={pingStatus.loading ? 'spinner' : ''} />
        </button>
      </div>

      {/* Карточка автосинхронизации */}
      <div className="health-card" id="health-rozetka-autosync">
        <div className="health-card__icon text-emerald">
          <Zap size={20} />
        </div>
        <div className="health-card__content">
          <div className="health-card__label">{t('healthAutoSync')}</div>
          <div className="health-card__status text-primary flex items-center gap-1.5">
            <span
              className={`dot ${
                exportEnabled ? 'dot--emerald animate-pulse' : 'dot--amber'
              }`}
            />
            <span>{exportEnabled ? t('statusEnabled') : t('statusDisabled')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
