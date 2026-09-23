import React, { useState, useCallback, useEffect } from 'react';
import {
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Radio,
  Zap,
  Layers,
  Database,
  Link2,
  Clock,
  Download,
  Upload,
  Save,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { promApi, tenantsApi, limanApi } from '@/api/client';
import { PromExportModal } from './PromExportModal';
import { PromImportModal } from './PromImportModal';
import { PromWizard } from './PromWizard';

interface PromTabProps {
  tenantId: string;
  tenant: any;
  onTenantUpdated: () => void;
}

export const PromTab: React.FC<PromTabProps> = ({
  tenantId,
  tenant,
  onTenantUpdated,
}) => {
  const { t, language } = useLanguage();

  // Status States
  const [mariadbStatus, setMariadbStatus] = useState<{
    loading: boolean;
    success?: boolean;
    pingMs?: number;
  }>({ loading: false });

  const [promStatus, setPromStatus] = useState<{
    loading: boolean;
    success?: boolean;
    shopTitle?: string;
    message?: string;
  }>({ loading: false });

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Form State
  const [shopTitle, setShopTitle] = useState(tenant?.promShopTitle || '');
  const [apiKey, setApiKey] = useState(tenant?.promApiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [exportEnabled, setExportEnabled] = useState(
    Boolean(tenant?.promExportEnabled),
  );
  const [syncInterval, setSyncInterval] = useState<number>(
    tenant?.promSyncIntervalMinutes || 15,
  );
  const [orderWebhookEnabled, setOrderWebhookEnabled] = useState(
    tenant?.promOrderWebhookEnabled !== false,
  );
  const [createOrderDocumentEnabled, setCreateOrderDocumentEnabled] = useState(
    Boolean(tenant?.promCreateOrderDocumentEnabled),
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Action State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Copy States
  const [isFeedCopied, setIsFeedCopied] = useState(false);
  const [isWebhookCopied, setIsWebhookCopied] = useState(false);

  // Sync state with tenant props
  useEffect(() => {
    if (tenant) {
      setShopTitle(tenant.promShopTitle || '');
      setApiKey(tenant.promApiKey || '');
      setExportEnabled(Boolean(tenant.promExportEnabled));
      setSyncInterval(tenant.promSyncIntervalMinutes || 15);
      setOrderWebhookEnabled(tenant.promOrderWebhookEnabled !== false);
      setCreateOrderDocumentEnabled(Boolean(tenant.promCreateOrderDocumentEnabled));
    }
  }, [tenant]);

  // Check MariaDB ping
  const checkMariaDb = useCallback(async () => {
    setMariadbStatus({ loading: true });
    const start = Date.now();
    try {
      await limanApi.ping(tenantId);
      const pingMs = Date.now() - start;
      setMariadbStatus({ loading: false, success: true, pingMs });
    } catch {
      setMariadbStatus({ loading: false, success: false });
    }
  }, [tenantId]);

  // Ping Prom API
  const handlePing = useCallback(async () => {
    setPromStatus({ loading: true });
    try {
      const res = await promApi.ping(tenantId);
      setPromStatus({
        loading: false,
        success: true,
        shopTitle: res.data?.shopTitle || tenant?.promShopTitle,
        message: res.data?.message || t('promPingSuccess'),
      });
      if (res.data?.shopTitle && res.data.shopTitle !== shopTitle) {
        setShopTitle(res.data.shopTitle);
        onTenantUpdated();
      }
    } catch (err: any) {
      setPromStatus({
        loading: false,
        success: false,
        message:
          err.response?.data?.message ||
          err.message ||
          t('statusDisconnected'),
      });
    }
  }, [tenantId, t, shopTitle, tenant?.promShopTitle, onTenantUpdated]);

  // Initial checks
  useEffect(() => {
    checkMariaDb();
    if (tenant?.promApiKey) {
      handlePing();
    }
  }, [tenant?.promApiKey, checkMariaDb, handlePing]);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const payload: Record<string, any> = {
        promShopTitle: shopTitle.trim() || undefined,
        promExportEnabled: exportEnabled,
        promSyncIntervalMinutes: Number(syncInterval),
        promOrderWebhookEnabled: orderWebhookEnabled,
        promCreateOrderDocumentEnabled: createOrderDocumentEnabled,
      };

      if (apiKey && apiKey !== '••••••••' && apiKey !== '********') {
        payload.promApiKey = apiKey.trim();
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

  // Trigger Sync Prices and Stocks
  const handleSyncStock = async () => {
    setIsSyncing(true);
    setSyncReport(null);
    try {
      await promApi.syncStock(tenantId);
      setSyncReport({
        success: true,
        message:
          language === 'uk'
            ? 'Завдання оновлення цін та залишків поставлено в чергу BullMQ'
            : 'Задача обновления остатков и цен поставлена в очередь BullMQ',
      });
    } catch (err: any) {
      setSyncReport({
        success: false,
        message:
          err.response?.data?.message || err.message || t('error'),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const feedUrl = `${window.location.origin}/api/v1/prom/${tenantId}/feed.xml`;
  const webhookUrl = `${window.location.origin}/api/v1/prom/${tenantId}/webhook/order`;

  return (
    <div className="space-y-6" id="prom-tab-content">
      {/* Quick-Start Wizard */}
      <PromWizard />

      {/* 1. Диагностический блок «Светофор» (3-Point Health Bar) */}
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
                    {tenant?.promApiKey ? t('statusDisconnected') : t('availableForConnection')}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--xs self-center"
            onClick={handlePing}
            disabled={promStatus.loading || !tenant?.promApiKey}
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

      {/* 2. Action Hub (3 карточки действий) */}
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
              {language === 'uk'
                ? 'Зчитує залишки складу та ціни з MariaDB і оновлює їх на Prom.ua через фонову чергу BullMQ.'
                : 'Считывает остатки склада и цены из MariaDB и обновляет их на Prom.ua через фоновую очередь BullMQ.'}
            </p>

            <div className="mt-auto space-y-3">
              <button
                type="button"
                className="btn btn--primary w-full gap-1.5"
                id="btn-prom-sync-now"
                onClick={handleSyncStock}
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
                onClick={() => setIsImportModalOpen(true)}
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
                onClick={() => setIsExportModalOpen(true)}
              >
                <Upload size={16} />
                <span>{t('btnPromExport')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Фид каталога товаров Prom.ua */}
      <div className="card" id="prom-feed-card">
        <div className="card__header">
          <h2 className="card__title">
            <Layers size={20} className="text-indigo flex-shrink-0" />
            <span>{t('promYmlFeed')}</span>
          </h2>
        </div>
        <div className="card__body space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            {t('promFeedDesc')}
          </p>
          <div className="bg-elevated p-3 rounded-lg border border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <span className="font-mono text-xs text-primary truncate" id="prom-feed-url">
              {feedUrl}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  navigator.clipboard.writeText(feedUrl);
                  setIsFeedCopied(true);
                  setTimeout(() => setIsFeedCopied(false), 2000);
                }}
                title={t('copyFeedLink')}
              >
                {isFeedCopied ? (
                  <Check size={14} className="text-emerald" />
                ) : (
                  <Copy size={14} />
                )}
                <span>{isFeedCopied ? t('copied') : t('copy')}</span>
              </button>
              <a
                href={feedUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn--secondary btn--sm"
                title="Открыть YML в новой вкладке"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Форма настроек Prom API & Вебхуков */}
      <div className="card" id="prom-settings-card">
        <div className="card__header">
          <h2 className="card__title">
            <Radio size={20} className="text-indigo flex-shrink-0" />
            <span>{t('promSettings')}</span>
          </h2>
        </div>
        <form onSubmit={handleSaveSettings} className="card__body space-y-4">
          {/* Название магазина */}
          <div className="form-group">
            <label className="form-label">{t('promShopTitle')}</label>
            <input
              type="text"
              className="input"
              value={shopTitle}
              onChange={(e) => setShopTitle(e.target.value)}
              placeholder={t('promShopTitlePlaceholder')}
            />
          </div>

          {/* Секретный токен API */}
          <div className="form-group">
            <label className="form-label">{t('promApiKeyLabel')}</label>
            <div className="input-group">
              <input
                type={showApiKey ? 'text' : 'password'}
                className="input font-mono"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="form-input-reveal"
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? 'Hide' : 'Show'}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="text-[11px] text-muted">
              {language === 'uk'
                ? 'Отримайте токен у кабінеті Prom: Налаштування → Керування сайтом → Послуги Prom.ua / API.'
                : 'Получите токен в кабинете Prom: Настройки → Управление сайтом → Услуги Prom.ua / API.'}
            </span>
          </div>

          {/* Тумблер фонового экспорта и интервал */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 bg-elevated rounded-lg border border-subtle">
            <div>
              <div className="text-xs font-semibold text-primary">
                {t('promExportToggle')}
              </div>
              <div className="text-[11px] text-muted">
                {language === 'uk'
                  ? 'Фонове вивантаження цін та залишків через воркер BullMQ'
                  : 'Фоновая выгрузка остатков и цен через воркер BullMQ'}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                className="input text-xs"
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
                disabled={!exportEnabled}
              >
                <option value={5}>5 мин</option>
                <option value={15}>15 мин</option>
                <option value={30}>30 мин</option>
                <option value={60}>60 мин</option>
              </select>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={exportEnabled}
                  onChange={(e) => setExportEnabled(e.target.checked)}
                />
                <span className="slider round" />
              </label>
            </div>
          </div>

          {/* Вебхук приема заказов */}
          <div className="flex items-center justify-between p-3 bg-elevated rounded-lg border border-subtle">
            <div>
              <div className="text-xs font-semibold text-primary">
                {t('orderWebhook')}
              </div>
              <div className="text-[11px] text-muted">
                {language === 'uk'
                  ? 'Автоматичне списання залишків у MariaDB при оформленні замовлення в Prom.ua'
                  : 'Автоматическое списание остатков в MariaDB при оформлении заказа в Prom.ua'}
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

          {orderWebhookEnabled && (
            <div className="bg-elevated/50 p-2 rounded-lg border border-subtle flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-primary truncate" id="prom-webhook-url">
                {webhookUrl}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--xs flex-shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  setIsWebhookCopied(true);
                  setTimeout(() => setIsWebhookCopied(false), 2000);
                }}
                title={t('copyWebhookUrl')}
              >
                {isWebhookCopied ? (
                  <Check size={12} className="text-emerald" />
                ) : (
                  <Copy size={12} />
                )}
                <span>{isWebhookCopied ? t('copySuccess') : t('copy')}</span>
              </button>
            </div>
          )}

          {/* Режим фиксации заказов: прямое списание vs черновик накладной tip_dok 85 */}
          <div className="p-3 bg-elevated rounded-lg border border-subtle space-y-2" id="prom-order-doc-mode-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary">
                    {t('promCreateOrderDocument')}
                  </span>
                  <span className="badge badge--warning text-[10px]">
                    {t('experimental')}
                  </span>
                </div>
                <div className="text-[11px] text-muted">
                  {t('promCreateOrderDocumentDesc')}
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={createOrderDocumentEnabled}
                  onChange={(e) => setCreateOrderDocumentEnabled(e.target.checked)}
                />
                <span className="slider round" />
              </label>
            </div>
            <div className="text-[11px] text-muted bg-surface/40 p-2 rounded border border-subtle/50">
              {createOrderDocumentEnabled ? (
                <span className="text-amber-400 font-mono">
                  ⚡ {t('orderDocModeDoc')}
                </span>
              ) : (
                <span className="text-emerald font-mono">
                  🛡️ {t('orderDocModeDirect')}
                </span>
              )}
            </div>
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
                <Save size={16} />
              )}
              <span>{t('save')}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Модальное окно экспорта в Prom */}
      <PromExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        tenantId={tenantId}
        onExportFinished={() => {
          onTenantUpdated();
          handlePing();
        }}
      />

      {/* Модальное окно импорта из Prom */}
      <PromImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tenantId={tenantId}
        onImportFinished={() => {
          onTenantUpdated();
          checkMariaDb();
        }}
      />
    </div>
  );
};
