import React, { useState, useEffect } from 'react';
import {
  Radio,
  Eye,
  EyeOff,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { tenantsApi } from '@/api/client';
import type { TenantData } from '@/components/admin/TenantModal';

interface WooSettingsFormProps {
  tenantId: string;
  tenant: TenantData;
  onTenantUpdated: () => void;
  onSettingsSaved: () => void;
}

export const WooSettingsForm: React.FC<WooSettingsFormProps> = ({
  tenantId,
  tenant,
  onTenantUpdated,
  onSettingsSaved,
}) => {
  const { t, language } = useLanguage();

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

  useEffect(() => {
    if (tenant) {
      setUrl(tenant.woocommerceUrl || '');
      setConsumerKey(tenant.woocommerceConsumerKey || '');
      setConsumerSecret(tenant.woocommerceConsumerSecret || '');
      setSyncEnabled(Boolean(tenant.woocommerceSyncEnabled));
      setOrderWebhookEnabled(tenant.woocommerceOrderWebhookEnabled ?? true);
    }
  }, [tenant]);

  const handleSubmit = async (e: React.FormEvent) => {
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
      onSettingsSaved();
    } catch (err: any) {
      setSaveError(
        err.response?.data?.message || err.message || t('error'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card" id="woo-settings-card">
      <div className="card__header">
        <h2 className="card__title">
          <Radio size={20} className="text-indigo flex-shrink-0" />
          <span>{t('wooSettings')}</span>
        </h2>
      </div>
      <form onSubmit={handleSubmit} className="card__body space-y-4">
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
            {t('wooConsumerSecretHint')}
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
  );
};
