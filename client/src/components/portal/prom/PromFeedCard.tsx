import React from 'react';
import { Layers, Copy, Check, ExternalLink, Send, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export interface PromFeedCardProps {
  feedUrl: string;
  isFeedCopied: boolean;
  isSendingFeed?: boolean;
  sendFeedResult?: { success: boolean; message: string } | null;
  onCopyFeed: () => void;
  onSendFeed?: () => void;
}

export const PromFeedCard: React.FC<PromFeedCardProps> = ({
  feedUrl,
  isFeedCopied,
  isSendingFeed = false,
  sendFeedResult,
  onCopyFeed,
  onSendFeed,
}) => {
  const { t } = useLanguage();

  return (
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

        {sendFeedResult && (
          <div
            className={`p-2 rounded text-xs flex items-start gap-1.5 ${
              sendFeedResult.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
          >
            <span>{sendFeedResult.message}</span>
          </div>
        )}

        <div className="bg-elevated p-3 rounded-lg border border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <span className="font-mono text-xs text-primary truncate" id="prom-feed-url">
            {feedUrl}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onSendFeed && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                id="btn-send-prom-feed-card"
                onClick={onSendFeed}
                disabled={isSendingFeed}
                title={t('sendFeedToProm')}
              >
                {isSendingFeed ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>{isSendingFeed ? t('sendingFeed') : t('sendFeedToProm')}</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onCopyFeed}
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
              title={t('openYmlInNewTab')}
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
