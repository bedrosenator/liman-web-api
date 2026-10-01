import React, { useState } from 'react';
import { Radio, Copy, Check } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface WooWebhooksCardProps {
  orderWebhookUrl: string;
  productWebhookUrl: string;
}

export const WooWebhooksCard: React.FC<WooWebhooksCardProps> = ({
  orderWebhookUrl,
  productWebhookUrl,
}) => {
  const { t } = useLanguage();
  const [isOrderWebhookCopied, setIsOrderWebhookCopied] = useState(false);
  const [isProductWebhookCopied, setIsProductWebhookCopied] = useState(false);

  const handleCopyOrderWebhook = () => {
    navigator.clipboard.writeText(orderWebhookUrl);
    setIsOrderWebhookCopied(true);
    setTimeout(() => setIsOrderWebhookCopied(false), 2000);
  };

  const handleCopyProductWebhook = () => {
    navigator.clipboard.writeText(productWebhookUrl);
    setIsProductWebhookCopied(true);
    setTimeout(() => setIsProductWebhookCopied(false), 2000);
  };

  return (
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
            <span
              className="font-mono text-xs text-primary truncate"
              id="woo-order-webhook-url"
            >
              {orderWebhookUrl}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--xs flex-shrink-0"
              onClick={handleCopyOrderWebhook}
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
            <span
              className="font-mono text-xs text-primary truncate"
              id="woo-product-webhook-url"
            >
              {productWebhookUrl}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--xs flex-shrink-0"
              onClick={handleCopyProductWebhook}
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
  );
};
