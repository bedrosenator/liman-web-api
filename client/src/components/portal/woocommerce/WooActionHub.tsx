import React from 'react';
import {
  Zap,
  Send,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { WooActionReport } from './types';

interface WooActionHubProps {
  hasWooCommerceUrl: boolean;
  actionLoading: string | null;
  actionReport: WooActionReport | null;
  onPushCatalog: () => void;
  onSyncStock: () => void;
  onImportCatalog: () => void;
}

export const WooActionHub: React.FC<WooActionHubProps> = ({
  hasWooCommerceUrl,
  actionLoading,
  actionReport,
  onPushCatalog,
  onSyncStock,
  onImportCatalog,
}) => {
  const { t } = useLanguage();

  return (
    <div className="card" id="woo-action-hub">
      <div className="card__header">
        <h2 className="card__title">
          <Zap size={20} className="text-amber flex-shrink-0" />
          <span>{t('wooActions')}</span>
        </h2>
      </div>
      <div className="card__body space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Action 1: Push Catalog */}
          <div className="p-3 bg-elevated rounded-lg border border-subtle flex flex-col justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-primary">
                {t('wooPushCatalog')}
              </div>
              <div className="text-[11px] text-muted">
                {t('wooPushCatalogDesc')}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm w-full"
              onClick={onPushCatalog}
              disabled={Boolean(actionLoading) || !hasWooCommerceUrl}
            >
              {actionLoading === 'push' ? (
                <Loader2 size={14} className="spinner" />
              ) : (
                <Send size={14} />
              )}
              <span>{t('wooPushCatalogBtnLabel')}</span>
            </button>
          </div>

          {/* Action 2: Sync Stock & Prices */}
          <div className="p-3 bg-elevated rounded-lg border border-subtle flex flex-col justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-primary">
                {t('wooSyncPricesStocks')}
              </div>
              <div className="text-[11px] text-muted">
                {t('wooSyncPricesStocksDesc')}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm w-full"
              onClick={onSyncStock}
              disabled={Boolean(actionLoading) || !hasWooCommerceUrl}
            >
              {actionLoading === 'stock' ? (
                <Loader2 size={14} className="spinner" />
              ) : (
                <Zap size={14} />
              )}
              <span>{t('wooSyncStockBtnLabel')}</span>
            </button>
          </div>

          {/* Action 3: Import Catalog */}
          <div className="p-3 bg-elevated rounded-lg border border-subtle flex flex-col justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-primary">
                {t('wooImportCatalog')}
              </div>
              <div className="text-[11px] text-muted">
                {t('wooImportCatalogDesc')}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm w-full"
              onClick={onImportCatalog}
              disabled={Boolean(actionLoading) || !hasWooCommerceUrl}
            >
              {actionLoading === 'import' ? (
                <Loader2 size={14} className="spinner" />
              ) : (
                <Upload size={14} />
              )}
              <span>{t('wooImportBtnLabel')}</span>
            </button>
          </div>
        </div>

        {actionReport && (
          <div
            className={`alert ${
              actionReport.success ? 'alert--success' : 'alert--danger'
            }`}
          >
            {actionReport.success ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{actionReport.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};
