import React, { useState } from 'react';
import { Radio, Copy, Check } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface RozetkaWebhookCardProps {
  webhookUrl: string;
}

export const RozetkaWebhookCard: React.FC<RozetkaWebhookCardProps> = ({ webhookUrl }) => {
  const { t } = useLanguage();
  const [isWebhookCopied, setIsWebhookCopied] = useState(false);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setIsWebhookCopied(true);
    setTimeout(() => setIsWebhookCopied(false), 2000);
  };

  return (
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
            onClick={handleCopyWebhook}
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
  );
};
