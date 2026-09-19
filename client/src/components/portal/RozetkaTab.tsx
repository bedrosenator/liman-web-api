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
import { rozetkaApi, tenantsApi } from '@/api/client';

interface RozetkaTabProps {
  tenantId: string;
  tenant: any;
  onTenantUpdated: () => void;
}

export const RozetkaTab: React.FC<RozetkaTabProps> = ({
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
  const [clientId, setClientId] = useState(tenant?.rozetkaClientId || '');
  const [clientSecret, setClientSecret] = useState(tenant?.rozetkaClientSecret || '');
  const [showSecret, setShowSecret] = useState(false);
  const [exportEnabled, setExportEnabled] = useState(
    Boolean(tenant?.rozetkaExportEnabled),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Action State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<{
    success: boolean;
    message: string;
    updated?: number;
  } | null>(null);

  // Copy State
  const [isFeedCopied, setIsFeedCopied] = useState(false);
  const [isWebhookCopied, setIsWebhookCopied] = useState(false);

  useEffect(() => {
    if (tenant) {
      setClientId(tenant.rozetkaClientId || '');
      setClientSecret(tenant.rozetkaClientSecret || '');
      setExportEnabled(Boolean(tenant.rozetkaExportEnabled));
    }
  }, [tenant]);

  // Ping Rozetka Seller API
  const handlePing = useCallback(async () => {
    setPingStatus({ loading: true });
    try {
      const res = await rozetkaApi.ping(tenantId);
      setPingStatus({
        loading: false,
        success: true,
        message: res.data?.message || t('rozetkaPingSuccess'),
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
    if (tenant?.rozetkaClientId) {
      handlePing();
    }
  }, [tenant?.rozetkaClientId, handlePing]);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const payload: Record<string, any> = {
        rozetkaClientId: clientId.trim(),
        rozetkaExportEnabled: exportEnabled,
      };
      if (clientSecret && clientSecret !== '••••••••' && clientSecret !== '********') {
        payload.rozetkaClientSecret = clientSecret.trim();
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
  const handleSyncPricesStocks = async () => {
    setIsSyncing(true);
    setSyncReport(null);
    try {
      const res = await rozetkaApi.syncPricesStocks(tenantId);
      setSyncReport({
        success: true,
        message:
          language === 'uk'
            ? `Синхронізацію Rozetka успішно виконано (${res.data?.updatedCount ?? res.data?.updated ?? 'OK'})`
            : `Синхронизация Rozetka успешно выполнена (${res.data?.updatedCount ?? res.data?.updated ?? 'OK'})`,
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

  const feedUrl = `${window.location.origin}/api/v1/rozetka/${tenantId}/feed.xml`;
  const webhookUrl = `${window.location.origin}/api/v1/rozetka/${tenantId}/webhook/order`;

  return (
    <div className="space-y-6" id="rozetka-tab-content">
      {/* Светофор подключения Rozetka */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  {tenant?.rozetkaClientId ? t('statusDisconnected') : t('availableForConnection')}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--xs self-center"
            onClick={handlePing}
            disabled={pingStatus.loading || !tenant?.rozetkaClientId}
            title={t('rozetkaTestConnection')}
          >
            <RefreshCw size={12} className={pingStatus.loading ? 'spinner' : ''} />
            <span>{t('checkConnection')}</span>
          </button>
        </div>

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

      {/* Action Hub */}
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
              onClick={handleSyncPricesStocks}
              disabled={isSyncing || !tenant?.rozetkaClientId}
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

      {/* Фид каталога товаров */}
      <div className="card" id="rozetka-feed-card">
        <div className="card__header">
          <h2 className="card__title">
            <Layers size={20} className="text-indigo flex-shrink-0" />
            <span>{t('rozetkaXmlFeed')}</span>
          </h2>
        </div>
        <div className="card__body space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            {t('rozetkaFeedDesc')}
          </p>
          <div className="bg-elevated p-3 rounded-lg border border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <span className="font-mono text-xs text-primary truncate" id="rozetka-feed-url">
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
                title="Открыть XML в браузере"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Вебхук заказов */}
      <div className="card" id="rozetka-webhook-card">
        <div className="card__header">
          <h2 className="card__title">
            <Radio size={20} className="text-emerald flex-shrink-0" />
            <span>{t('rozetkaOrderWebhook')}</span>
          </h2>
        </div>
        <div className="card__body space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            {t('rozetkaOrderWebhookDesc')}
          </p>
          <div className="bg-elevated p-3 rounded-lg border border-subtle flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-primary truncate" id="rozetka-webhook-url">
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

      {/* Форма настроек Rozetka API */}
      <div className="card" id="rozetka-settings-card">
        <div className="card__header">
          <h2 className="card__title">
            <Radio size={20} className="text-emerald flex-shrink-0" />
            <span>{t('rozetkaSettings')}</span>
          </h2>
        </div>
        <form onSubmit={handleSaveSettings} className="card__body space-y-4">
          <div className="form-group">
            <label className="form-label">{t('rozetkaClientIdLabel')} *</label>
            <input
              type="text"
              className="input font-mono"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 12345"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('rozetkaClientSecretLabel')} *</label>
            <div className="input-group">
              <input
                type={showSecret ? 'text' : 'password'}
                className="input font-mono"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="••••••••"
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
                ? 'Введіть логін та пароль API з особистого кабінету Rozetka Маркетплейс.'
                : 'Введите логин и пароль API из личного кабинета Rozetka Маркетплейс.'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-elevated rounded-lg border border-subtle">
            <div>
              <div className="text-xs font-semibold text-primary">
                {t('rozetkaExportToggle')}
              </div>
              <div className="text-[11px] text-muted">
                {language === 'uk'
                  ? 'Автоматичне фонове оновлення цін та залишків'
                  : 'Автоматическое фоновое обновление цен и остатков'}
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
