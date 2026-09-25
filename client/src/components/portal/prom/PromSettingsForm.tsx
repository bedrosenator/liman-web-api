import React from 'react';
import {
  Radio,
  Eye,
  EyeOff,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export interface PromSettingsFormProps {
  shopTitle: string;
  setShopTitle: (val: string) => void;
  apiKey: string;
  setApiKey: (val: string) => void;
  showApiKey: boolean;
  setShowApiKey: (val: boolean) => void;
  exportEnabled: boolean;
  setExportEnabled: (val: boolean) => void;
  syncInterval: number;
  setSyncInterval: (val: number) => void;
  orderWebhookEnabled: boolean;
  setOrderWebhookEnabled: (val: boolean) => void;
  createOrderDocumentEnabled: boolean;
  setCreateOrderDocumentEnabled: (val: boolean) => void;
  webhookUrl: string;
  isWebhookCopied: boolean;
  onCopyWebhook: () => void;
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  onSubmit: (e: React.FormEvent) => void;
}

export const PromSettingsForm: React.FC<PromSettingsFormProps> = ({
  shopTitle,
  setShopTitle,
  apiKey,
  setApiKey,
  showApiKey,
  setShowApiKey,
  exportEnabled,
  setExportEnabled,
  syncInterval,
  setSyncInterval,
  orderWebhookEnabled,
  setOrderWebhookEnabled,
  createOrderDocumentEnabled,
  setCreateOrderDocumentEnabled,
  webhookUrl,
  isWebhookCopied,
  onCopyWebhook,
  isSaving,
  saveSuccess,
  saveError,
  onSubmit,
}) => {
  const { t } = useLanguage();

  return (
    <div className="card" id="prom-settings-card">
      <div className="card__header">
        <h2 className="card__title">
          <Radio size={20} className="text-indigo flex-shrink-0" />
          <span>{t('promSettings')}</span>
        </h2>
      </div>
      <form onSubmit={onSubmit} className="card__body space-y-4">
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
            {t('promApiKeyHelp')}
          </span>
        </div>

        {/* Тумблер фонового экспорта и интервал */}
        <div className="flex items-center justify-between p-3 bg-elevated rounded-lg border border-subtle">
          <div>
            <div className="text-xs font-semibold text-primary">
              {t('promExportToggle')}
            </div>
            <div className="text-[11px] text-muted">
              {t('promExportHelp')}
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

        {exportEnabled && (
          <div className="form-group">
            <label className="form-label">{t('syncInterval')}</label>
            <select
              className="select"
              value={syncInterval}
              onChange={(e) => setSyncInterval(Number(e.target.value))}
            >
              <option value={5}>{t('interval5Min')}</option>
              <option value={15}>{t('interval15Min')}</option>
              <option value={30}>{t('interval30Min')}</option>
              <option value={60}>{t('interval60Min')}</option>
            </select>
          </div>
        )}

        {/* Вебхук приема заказов */}
        <div className="flex items-center justify-between p-3 bg-elevated rounded-lg border border-subtle">
          <div>
            <div className="text-xs font-semibold text-primary">
              {t('orderWebhook')}
            </div>
            <div className="text-[11px] text-muted">
              {t('promWebhookHelp')}
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
          <div className="bg-elevated/50 p-2 rounded-lg border border-subtle flex items-center justify-between gap-2 min-w-0">
            <span className="font-mono text-[11px] text-primary truncate min-w-0" id="prom-webhook-url" title={webhookUrl}>
              {webhookUrl}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--xs flex-shrink-0"
              onClick={onCopyWebhook}
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
  );
};
