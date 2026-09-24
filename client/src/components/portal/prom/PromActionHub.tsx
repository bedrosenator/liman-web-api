import React from 'react';
import {
  Zap,
  Download,
  Upload,
  FileCode,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { SyncReport } from './types';

export interface PromActionHubProps {
  isSyncing: boolean;
  syncProgress: number | null;
  syncStatusStep: string | null;
  syncReport: SyncReport | null;
  feedUrl: string;
  isFeedCopied: boolean;
  onCopyFeed: () => void;
  onSyncStock: () => void;
  onOpenImportModal: () => void;
  onOpenExportModal: () => void;
}

export const PromActionHub: React.FC<PromActionHubProps> = ({
  isSyncing,
  syncProgress,
  syncStatusStep,
  syncReport,
  feedUrl,
  isFeedCopied,
  onCopyFeed,
  onSyncStock,
  onOpenImportModal,
  onOpenExportModal,
}) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6" id="prom-action-hub">
      {/* Карточка 1: Синхронизация цен и остатков */}
      <div className="card flex flex-col justify-between" id="action-prom-sync-card">
        <div className="card__header">
          <h2 className="card__title">
            <Zap size={20} className="text-emerald flex-shrink-0" />
            <span>{t('syncPricesStock')}</span>
          </h2>
        </div>
        <div className="card__body flex flex-col justify-between flex-1">
          <p className="text-sm text-secondary mb-4">
            {t('promSyncPricesStockDesc')}
          </p>

          <div className="mt-auto">
            <button
              type="button"
              className="btn btn--primary"
              id="btn-prom-sync-now"
              onClick={onSyncStock}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  <span>{t('syncInProgress')}</span>
                </>
              ) : (
                <>
                  <Zap size={16} />
                  <span>{t('promSyncStock')}</span>
                </>
              )}
            </button>

            {isSyncing && (
              <div
                className="mt-3 p-3 bg-elevated rounded-lg border border-indigo/40 space-y-2"
                id="prom-sync-progress-card"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-indigo font-semibold">
                    <Loader2 size={14} className="spinner text-indigo" />
                    <span>{syncStatusStep || t('syncInProgress')}</span>
                  </span>
                  <span className="font-mono text-xs font-bold text-primary">
                    {syncProgress ?? 0}%
                  </span>
                </div>
                <div className="w-full bg-subtle h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(6, syncProgress ?? 0)}%` }}
                  />
                </div>
                <div className="text-[11px] text-muted flex justify-between items-center font-mono">
                  <span className="badge badge--xs badge--indigo">
                    <Zap size={10} />
                    {t('queueNameSync')}
                  </span>
                  <span className="text-emerald font-medium">● {t('workerActive')}</span>
                </div>
              </div>
            )}

            {syncReport && !isSyncing && (
              <div
                className={`mt-3 alert ${syncReport.success ? 'alert--success' : 'alert--danger'}`}
                id="prom-sync-report"
              >
                {syncReport.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span className="text-xs">{syncReport.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Карточка 2: Обратный импорт каталога Prom.ua -> MariaDB */}
      <div className="card flex flex-col justify-between" id="action-prom-import-card">
        <div className="card__header">
          <h2 className="card__title">
            <Download size={20} className="text-indigo flex-shrink-0" />
            <span>{t('promImportCatalog')}</span>
          </h2>
        </div>
        <div className="card__body flex flex-col justify-between flex-1">
          <p className="text-sm text-secondary mb-4">
            {t('promImportCatalogDesc')}
          </p>

          <div className="mt-auto">
            <button
              type="button"
              className="btn btn--secondary"
              id="btn-open-prom-import"
              onClick={onOpenImportModal}
            >
              <Download size={16} />
              <span>{t('btnPromImport')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Карточка 3: Экспорт товаров и YML-каталог фид */}
      <div className="card flex flex-col justify-between" id="prom-feed-card">
        <div className="card__header">
          <h2 className="card__title">
            <FileCode size={20} className="text-sky flex-shrink-0" />
            <span>{t('promExportCatalog')}</span>
          </h2>
        </div>
        <div className="card__body flex flex-col justify-between flex-1">
          <p className="text-sm text-secondary mb-3">
            {t('promExportCatalogDesc')}
          </p>

          <div className="mt-auto">
            <div className="mb-3">
              <button
                type="button"
                className="btn btn--primary"
                id="btn-direct-prom-export"
                onClick={onOpenExportModal}
              >
                <Upload size={16} />
                <span>{t('btnPromExport')}</span>
              </button>
            </div>

            <div className="bg-elevated p-2.5 rounded-lg border border-subtle mb-3 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-primary truncate" id="prom-feed-url">
                {feedUrl}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                id="btn-copy-prom-feed"
                onClick={onCopyFeed}
              >
                {isFeedCopied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
                <span>{isFeedCopied ? t('copySuccess') : t('copyFeedLink')}</span>
              </button>

              <a
                href={feedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--secondary btn--sm"
                id="btn-open-prom-feed"
                title={t('openFeed')}
              >
                <ExternalLink size={14} />
                <span>{t('openFeed')}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

