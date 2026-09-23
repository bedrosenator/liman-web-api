import React from 'react';
import { Zap, Download, Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { SyncReport } from './types';

export interface PromActionHubProps {
  isSyncing: boolean;
  syncReport: SyncReport | null;
  onSyncStock: () => void;
  onOpenImportModal: () => void;
  onOpenExportModal: () => void;
}

export const PromActionHub: React.FC<PromActionHubProps> = ({
  isSyncing,
  syncReport,
  onSyncStock,
  onOpenImportModal,
  onOpenExportModal,
}) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="prom-action-hub">
      {/* Карточка 1: Синхронизация цен и остатков */}
      <div className="card flex flex-col justify-between" id="action-prom-sync-card">
        <div className="card__header">
          <h2 className="card__title">
            <Zap size={20} className="text-emerald flex-shrink-0" />
            <span>{t('syncPricesStock')}</span>
          </h2>
        </div>
        <div className="card__body flex flex-col justify-between flex-1">
          <p className="text-xs text-muted mb-4">
            {t('promSyncPricesStockDesc')}
          </p>

          <div className="mt-auto space-y-3">
            <button
              type="button"
              className="btn btn--primary w-full gap-1.5"
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

            {syncReport && (
              <div
                className={`alert text-xs py-2 px-3 ${
                  syncReport.success ? 'alert--success' : 'alert--danger'
                }`}
              >
                {syncReport.success ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <AlertCircle size={14} />
                )}
                <span>{syncReport.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Карточка 2: Обратный импорт каталога */}
      <div className="card flex flex-col justify-between" id="action-prom-import-card">
        <div className="card__header">
          <h2 className="card__title">
            <Download size={20} className="text-indigo flex-shrink-0" />
            <span>{t('promImportCatalog')}</span>
          </h2>
        </div>
        <div className="card__body flex flex-col justify-between flex-1">
          <p className="text-xs text-muted mb-4">
            {t('promImportCatalogDesc')}
          </p>

          <div className="mt-auto">
            <button
              type="button"
              className="btn btn--secondary w-full gap-1.5"
              id="btn-open-prom-import"
              onClick={onOpenImportModal}
            >
              <Download size={16} />
              <span>{t('btnPromImport')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Карточка 3: Прямой экспорт каталога */}
      <div className="card flex flex-col justify-between" id="action-prom-export-card">
        <div className="card__header">
          <h2 className="card__title">
            <Upload size={20} className="text-amber flex-shrink-0" />
            <span>{t('promExportCatalog')}</span>
          </h2>
        </div>
        <div className="card__body flex flex-col justify-between flex-1">
          <p className="text-xs text-muted mb-4">
            {t('promExportCatalogDesc')}
          </p>

          <div className="mt-auto">
            <button
              type="button"
              className="btn btn--secondary w-full gap-1.5"
              id="btn-open-prom-export"
              onClick={onOpenExportModal}
            >
              <Upload size={16} />
              <span>{t('btnPromExport')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
