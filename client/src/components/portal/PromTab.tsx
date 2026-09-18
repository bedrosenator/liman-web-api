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
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { promApi, tenantsApi } from '@/api/client';

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

  // Status State
  const [pingStatus, setPingStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  // Form State
  const [apiKey, setApiKey] = useState(tenant?.promApiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [exportEnabled, setExportEnabled] = useState(
    Boolean(tenant?.promExportEnabled),
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

  // Copy State
  const [isFeedCopied, setIsFeedCopied] = useState(false);
  const [isWebhookCopied, setIsWebhookCopied] = useState(false);

  // Update form when tenant loads
  useEffect(() => {
    if (tenant) {
      setApiKey(tenant.promApiKey || '');
      setExportEnabled(Boolean(tenant.promExportEnabled));
    }
  }, [tenant]);

  // Ping Prom API
  const handlePing = useCallback(async () => {
    setPingStatus({ loading: true });
    try {
      const res = await promApi.ping(tenantId);
      setPingStatus({
        loading: false,
        success: true,
        message: res.data?.message || t('promPingSuccess'),
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

  // Check on initial load if API key present
  useEffect(() => {
    if (tenant?.promApiKey) {
      handlePing();
    }
  }, [tenant?.promApiKey, handlePing]);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const payload: Record<string, any> = {
        promExportEnabled: exportEnabled,
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

  // Trigger Sync
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
      {/* Светофор подключения Prom.ua */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="health-card" id="health-prom">
          <div className="health-card__icon text-indigo">
            <Radio size={20} />
          </div>
          <div className="health-card__content">
            <div className="health-card__label">Prom.ua Seller API</div>
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
                  {tenant?.promApiKey ? t('statusDisconnected') : t('availableForConnection')}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--xs self-center"
            onClick={handlePing}
            disabled={pingStatus.loading || !tenant?.promApiKey}
            title={t('promTestConnection')}
          >
            <RefreshCw size={12} className={pingStatus.loading ? 'spinner' : ''} />
            <span>{t('checkConnection')}</span>
          </button>
        </div>

        <div className="health-card" id="health-prom-autosync">
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

      {/* Action Hub */}
      <div className="card" id="prom-action-hub">
        <div className="card__header">
          <h2 className="card__title">
            <Zap size={20} className="text-amber flex-shrink-0" />
            <span>Действия / Дії Prom.ua</span>
          </h2>
        </div>
        <div className="card__body space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 bg-elevated rounded-lg border border-subtle">
            <div>
              <div className="text-sm font-semibold text-primary">
                {t('promSyncStock')}
              </div>
              <div className="text-xs text-muted">
                {t('promSyncStockDesc')}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary flex-shrink-0"
              onClick={handleSyncStock}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 size={16} className="spinner" />
              ) : (
                <Zap size={16} />
              )}
              <span>{isSyncing ? t('syncInProgress') : t('promSyncStock')}</span>
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

      {/* Фид каталога товаров */}
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
                title="Открыть YML в браузере"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Вебхук заказов */}
      <div className="card" id="prom-webhook-card">
        <div className="card__header">
          <h2 className="card__title">
            <Radio size={20} className="text-emerald flex-shrink-0" />
            <span>Вебхук заказов Prom.ua</span>
          </h2>
        </div>
        <div className="card__body space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            {t('promOrderWebhookDesc')}
          </p>
          <div className="bg-elevated p-3 rounded-lg border border-subtle flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-primary truncate" id="prom-webhook-url">
              {webhookUrl}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--sm flex-shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                setIsWebhookCopied(true);
                setTimeout(() => setIsWebhookCopied(false), 2000);
              }}
              title={t('copyWebhookUrl')}
            >
              {isWebhookCopied ? (
                <Check size={14} className="text-emerald" />
              ) : (
                <Copy size={14} />
              )}
              <span>{isWebhookCopied ? t('copySuccess') : t('copy')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Форма настроек Prom API */}
      <div className="card" id="prom-settings-card">
        <div className="card__header">
          <h2 className="card__title">
            <Radio size={20} className="text-indigo flex-shrink-0" />
            <span>{t('promSettings')}</span>
          </h2>
        </div>
        <form onSubmit={handleSaveSettings} className="card__body space-y-4">
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

          <div className="flex items-center justify-between p-3 bg-elevated rounded-lg border border-subtle">
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
            <label className="switch">
              <input
                type="checkbox"
                checked={exportEnabled}
                onChange={(e) => setExportEnabled(e.target.checked)}
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
