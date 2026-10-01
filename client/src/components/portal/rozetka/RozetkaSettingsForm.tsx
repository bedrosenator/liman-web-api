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

interface RozetkaSettingsFormProps {
  tenantId: string;
  tenant: TenantData;
  onTenantUpdated: () => void;
  onSettingsSaved: () => void;
}

export const RozetkaSettingsForm: React.FC<RozetkaSettingsFormProps> = ({
  tenantId,
  tenant,
  onTenantUpdated,
  onSettingsSaved,
}) => {
  const { t, language } = useLanguage();

  const [clientId, setClientId] = useState(tenant?.rozetkaClientId || '');
  const [clientSecret, setClientSecret] = useState(tenant?.rozetkaClientSecret || '');
  const [showSecret, setShowSecret] = useState(false);
  const [exportEnabled, setExportEnabled] = useState(
    Boolean(tenant?.rozetkaExportEnabled),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setClientId(tenant.rozetkaClientId || '');
      setClientSecret(tenant.rozetkaClientSecret || '');
      setExportEnabled(Boolean(tenant.rozetkaExportEnabled));
    }
  }, [tenant]);

  const handleSubmit = async (e: React.FormEvent) => {
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
    <div className="card" id="rozetka-settings-card">
      <div className="card__header">
        <h2 className="card__title">
          <Radio size={20} className="text-emerald flex-shrink-0" />
          <span>{t('rozetkaSettings')}</span>
        </h2>
      </div>
      <form onSubmit={handleSubmit} className="card__body space-y-4">
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
            {t('rozetkaConsumerSecretHint')}
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
  );
};
