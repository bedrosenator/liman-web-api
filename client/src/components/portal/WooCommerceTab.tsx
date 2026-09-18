import React, { useState, useCallback, useEffect } from 'react';
import {
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Radio,
  Zap,
  Download,
  Upload,
  Send,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { woocommerceApi, tenantsApi } from '@/api/client';

interface WooCommerceTabProps {
  tenantId: string;
  tenant: any;
  onTenantUpdated: () => void;
}

export const WooCommerceTab: React.FC<WooCommerceTabProps> = ({
  tenantId,
  tenant,
  onTenantUpdated,
}) => {
  const { t, language } = useLanguage();

  // Status State
  const [pingStatus, setPingStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  // Form State
  const [url, setUrl] = useState(tenant?.woocommerceUrl || '');
  const [consumerKey, setConsumerKey] = useState(tenant?.woocommerceConsumerKey || '');
  const [consumerSecret, setConsumerSecret] = useState(
    tenant?.woocommerceConsumerSecret || '',
  );
  const [showSecret, setShowSecret] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(
    Boolean(tenant?.woocommerceSyncEnabled),
  );
  const [orderWebhookEnabled, setOrderWebhookEnabled] = useState(
    tenant?.woocommerceOrderWebhookEnabled ?? true,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Action State
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionReport, setActionReport] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Copy State
  const [isOrderWebhookCopied, setIsOrderWebhookCopied] = useState(false);
  const [isProductWebhookCopied, setIsProductWebhookCopied] = useState(false);

  useEffect(() => {
    if (tenant) {
      setUrl(tenant.woocommerceUrl || '');
      setConsumerKey(tenant.woocommerceConsumerKey || '');
      setConsumerSecret(tenant.woocommerceConsumerSecret || '');
      setSyncEnabled(Boolean(tenant.woocommerceSyncEnabled));
      setOrderWebhookEnabled(tenant.woocommerceOrderWebhookEnabled ?? true);
    }
  }, [tenant]);

  // Ping WooCommerce
  const handlePing = useCallback(async () => {
    setPingStatus({ loading: true });
    try {
      const res = await woocommerceApi.ping(tenantId);
      setPingStatus({
        loading: false,
        success: res.data?.success ?? true,
        message: res.data?.message || t('wooPingSuccess'),
      });
    } catch (err: any) {
      setPingStatus({
        loading: false,
        success: false,
        message:
          err.response?.data?.message ||
          err.message ||
          t('statusDisconnected'),
      });
    }
  }, [tenantId, t]);

  useEffect(() => {
    if (tenant?.woocommerceUrl && tenant?.woocommerceConsumerKey) {
      handlePing();
    }
  }, [tenant?.woocommerceUrl, tenant?.woocommerceConsumerKey, handlePing]);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const payload: Record<string, any> = {
        woocommerceUrl: url.trim(),
        woocommerceConsumerKey: consumerKey.trim(),
        woocommerceSyncEnabled: syncEnabled,
        woocommerceOrderWebhookEnabled: orderWebhookEnabled,
      };
      if (
        consumerSecret &&
        consumerSecret !== '••••••••' &&
        consumerSecret !== '********'
      ) {
        payload.woocommerceConsumerSecret = consumerSecret.trim();
      }

      await tenantsApi.update(tenantId, payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onTenantUpdated();
      handlePing();
    } catch (err: any) {
      setSaveError(
        err.response?.data?.message || err.message || t('error'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Actions
  const handlePushCatalog = async () => {
    setActionLoading('push');
    setActionReport(null);
    try {
      await woocommerceApi.syncProducts(tenantId);
      setActionReport({
        success: true,
        message:
          language === 'uk'
            ? 'Вивантаження каталогу у WooCommerce успішно запущено'
            : 'Выгрузка каталога в WooCommerce успешно запущена',
      });
    } catch (err: any) {
      setActionReport({
        success: false,
        message: err.response?.data?.message || err.message || t('error'),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncStock = async () => {
    setActionLoading('stock');
    setActionReport(null);
    try {
      await woocommerceApi.syncStock(tenantId);
      setActionReport({
        success: true,
        message:
          language === 'uk'
            ? 'Оновлення цін та залишків у WooCommerce успішно виконано'
            : 'Обновление цен и остатков в WooCommerce успешно выполнено',
      });
    } catch (err: any) {
      setActionReport({
        success: false,
        message: err.response?.data?.message || err.message || t('error'),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleImportCatalog = async () => {
    setActionLoading('import');
    setActionReport(null);
    try {
      await woocommerceApi.importCatalog(tenantId);
      setActionReport({
        success: true,
        message:
          language === 'uk'
            ? 'Імпорт товарів з WooCommerce додано в чергу BullMQ'
            : 'Импорт товаров из WooCommerce добавлен в очередь BullMQ',
      });
    } catch (err: any) {
      setActionReport({
        success: false,
        message: err.response?.data?.message || err.message || t('error'),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const downloadUrl = woocommerceApi.getPluginDownloadUrl(tenantId);
  const orderWebhookUrl = `${window.location.origin}/api/v1/woocommerce/${tenantId}/webhook/order`;
  const productWebhookUrl = `${window.location.origin}/api/v1/woocommerce/${tenantId}/webhook/product`;

  return (
    <div className="space-y-6" id="woocommerce-tab-content">
      {/* Светофор подключения WooCommerce */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="health-card" id="health-woocommerce">
          <div className="health-card__icon text-indigo">
            <Radio size={20} />
          </div>
          <div className="health-card__content">
            <div className="health-card__label">WooCommerce REST API</div>
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
                  {tenant?.woocommerceUrl ? t('statusDisconnected') : t('availableForConnection')}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--xs self-center"
            onClick={handlePing}
            disabled={pingStatus.loading || !tenant?.woocommerceUrl}
            title={t('wooTestConnection')}
          >
            <RefreshCw size={12} className={pingStatus.loading ? 'spinner' : ''} />
            <span>{t('checkConnection')}</span>
          </button>
        </div>

        <div className="health-card" id="health-woo-autosync">
          <div className="health-card__icon text-emerald">
            <Zap size={20} />
          </div>
          <div className="health-card__content">
            <div className="health-card__label">{t('healthAutoSync')}</div>
            <div className="health-card__status text-primary flex items-center gap-1.5">
              <span
                className={`dot ${
                  syncEnabled ? 'dot--emerald animate-pulse' : 'dot--amber'
                }`}
              />
              <span>{syncEnabled ? t('statusEnabled') : t('statusDisabled')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Скачивание плагина WordPress */}
      <div className="card" id="woo-plugin-card">
        <div className="card__header">
          <h2 className="card__title">
            <Download size={20} className="text-emerald flex-shrink-0" />
            <span>{t('wooDownloadPlugin')}</span>
          </h2>
        </div>
        <div className="card__body flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-muted leading-relaxed">
            {t('wooDownloadPluginDesc')}
          </p>
          <a
            href={downloadUrl}
            download="limansoft-sync-woocommerce.zip"
            className="btn btn--primary flex-shrink-0 gap-1.5"
            id="download-woo-plugin-btn"
          >
            <Download size={16} />
            <span>{t('download')} .zip</span>
          </a>
        </div>
      </div>

      {/* Action Hub */}
      <div className="card" id="woo-action-hub">
        <div className="card__header">
          <h2 className="card__title">
            <Zap size={20} className="text-amber flex-shrink-0" />
            <span>Действия / Дії WooCommerce</span>
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
                onClick={handlePushCatalog}
                disabled={Boolean(actionLoading) || !tenant?.woocommerceUrl}
              >
                {actionLoading === 'push' ? (
                  <Loader2 size={14} className="spinner" />
                ) : (
                  <Send size={14} />
                )}
                <span>Push каталога</span>
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
                onClick={handleSyncStock}
                disabled={Boolean(actionLoading) || !tenant?.woocommerceUrl}
              >
                {actionLoading === 'stock' ? (
                  <Loader2 size={14} className="spinner" />
                ) : (
                  <Zap size={14} />
                )}
                <span>Цены и остатки</span>
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
                onClick={handleImportCatalog}
                disabled={Boolean(actionLoading) || !tenant?.woocommerceUrl}
              >
                {actionLoading === 'import' ? (
                  <Loader2 size={14} className="spinner" />
                ) : (
                  <Upload size={14} />
                )}
                <span>Импорт с сайта</span>
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

      {/* Вебхуки заказов и товаров */}
      <div className="card" id="woo-webhooks-card">
        <div className="card__header">
          <h2 className="card__title">
            <Radio size={20} className="text-emerald flex-shrink-0" />
            <span>Вебхуки WooCommerce</span>
          </h2>
        </div>
        <div className="card__body space-y-4">
          <div>
            <div className="text-xs font-semibold text-primary mb-1">
              Вебхук заказов (Order Webhook)
            </div>
            <div className="bg-elevated p-2.5 rounded-lg border border-subtle flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-primary truncate" id="woo-order-webhook-url">
                {orderWebhookUrl}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--xs flex-shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(orderWebhookUrl);
                  setIsOrderWebhookCopied(true);
                  setTimeout(() => setIsOrderWebhookCopied(false), 2000);
                }}
                title={t('copyWebhookUrl')}
              >
                {isOrderWebhookCopied ? (
                  <Check size={12} className="text-emerald" />
                ) : (
                  <Copy size={12} />
                )}
                <span>{isOrderWebhookCopied ? t('copySuccess') : t('copy')}</span>
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-primary mb-1">
              Вебхук новинок (Product Webhook)
            </div>
            <div className="bg-elevated p-2.5 rounded-lg border border-subtle flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-primary truncate" id="woo-product-webhook-url">
                {productWebhookUrl}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--xs flex-shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(productWebhookUrl);
                  setIsProductWebhookCopied(true);
                  setTimeout(() => setIsProductWebhookCopied(false), 2000);
                }}
                title={t('copyWebhookUrl')}
              >
                {isProductWebhookCopied ? (
                  <Check size={12} className="text-emerald" />
                ) : (
                  <Copy size={12} />
                )}
                <span>{isProductWebhookCopied ? t('copySuccess') : t('copy')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Форма настроек WooCommerce API */}
      <div className="card" id="woo-settings-card">
        <div className="card__header">
          <h2 className="card__title">
            <Radio size={20} className="text-indigo flex-shrink-0" />
            <span>{t('wooSettings')}</span>
          </h2>
        </div>
        <form onSubmit={handleSaveSettings} className="card__body space-y-4">
          <div className="form-group">
            <label className="form-label">{t('wooStoreUrlLabel')} *</label>
            <input
              type="text"
              className="input font-mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://my-shop.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('wooConsumerKeyLabel')} *</label>
            <input
              type="text"
              className="input font-mono"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              placeholder="ck_••••••••••••••••••••••••••••••••••••••••"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('wooConsumerSecretLabel')} *</label>
            <div className="input-group">
              <input
                type={showSecret ? 'text' : 'password'}
                className="input font-mono"
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                placeholder="cs_••••••••••••••••••••••••••••••••••••••••"
              />
              <button
                type="button"
                className="form-input-reveal"
                onClick={() => setShowSecret(!showSecret)}
                aria-label={showSecret ? 'Hide' : 'Show'}
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="text-[11px] text-muted">
              {language === 'uk'
                ? 'Згенеруйте ключі у WordPress: WooCommerce → Налаштування → Додатково → REST API.'
                : 'Сгенерируйте ключи в WordPress: WooCommerce → Настройки → Дополнительно → REST API.'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-elevated rounded-lg border border-subtle">
            <div>
              <div className="text-xs font-semibold text-primary">
                {t('wooTwoWaySyncToggle')}
              </div>
              <div className="text-[11px] text-muted">
                {language === 'uk'
                  ? 'Автоматична синхронізація залишків та цін у WooCommerce'
                  : 'Автоматическая синхронизация остатков и цен в WooCommerce'}
              </div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => setSyncEnabled(e.target.checked)}
              />
              <span className="slider round" />
            </label>
          </div>

          <div className="flex items-center justify-between p-3 bg-elevated rounded-lg border border-subtle">
            <div>
              <div className="text-xs font-semibold text-primary">
                {t('wooOrderWebhook')}
              </div>
              <div className="text-[11px] text-muted">
                {language === 'uk'
                  ? 'Автоматичне списання залишків у Limansoft при замовленні у WooCommerce'
                  : 'Автоматическое списание остатков в Limansoft при заказе в WooCommerce'}
              </div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={orderWebhookEnabled}
                onChange={(e) => setOrderWebhookEnabled(e.target.checked)}
              />
              <span className="slider round" />
            </label>
          </div>

          {saveSuccess && (
            <div className="alert alert--success">
              <CheckCircle2 size={16} />
              <span>{t('settingsSaved')}</span>
            </div>
          )}

          {saveError && (
            <div className="alert alert--danger">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="btn btn--primary gap-1.5"
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 size={16} className="spinner" />
              ) : (
                <Check size={16} />
              )}
              <span>{t('save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
