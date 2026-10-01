import React from 'react';
import { Download } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface WooPluginCardProps {
  downloadUrl: string;
}

export const WooPluginCard: React.FC<WooPluginCardProps> = ({ downloadUrl }) => {
  const { t } = useLanguage();

  return (
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
  );
};
