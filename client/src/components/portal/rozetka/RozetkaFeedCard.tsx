import React, { useState } from 'react';
import { Layers, Copy, Check, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface RozetkaFeedCardProps {
  feedUrl: string;
}

export const RozetkaFeedCard: React.FC<RozetkaFeedCardProps> = ({ feedUrl }) => {
  const { t } = useLanguage();
  const [isFeedCopied, setIsFeedCopied] = useState(false);

  const handleCopyFeed = () => {
    navigator.clipboard.writeText(feedUrl);
    setIsFeedCopied(true);
    setTimeout(() => setIsFeedCopied(false), 2000);
  };

  return (
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
              onClick={handleCopyFeed}
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
              title={t('rozetkaOpenXmlTitle')}
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
