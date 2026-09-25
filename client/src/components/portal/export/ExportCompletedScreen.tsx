import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Clock,
  Zap,
  Copy,
  Check,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { StatBox } from '../common';
import type { ExportStats } from './types';

interface ExportCompletedScreenProps {
  stats: ExportStats | null;
  platform?: 'horoshop' | 'prom';
  feedUrl?: string;
}

export const ExportCompletedScreen: React.FC<ExportCompletedScreenProps> = ({
  stats,
  platform = 'horoshop',
  feedUrl,
}) => {
  const { t } = useLanguage();
  const [copiedFeed, setCopiedFeed] = useState(false);

  const hasPendingFeed = (stats?.pendingFeedCount ?? 0) > 0;
  const isRejected =
    Boolean(stats) &&
    ((stats?.errors ?? 0) > 0 || (stats?.totalExported ?? 0) === 0) &&
    (stats?.created ?? 0) === 0 &&
    (stats?.updated ?? 0) === 0 &&
    ((stats?.totalFetched ?? 0) > 0 || (stats?.errors ?? 0) > 0 || hasPendingFeed);

  const isPartial = Boolean(stats) && !isRejected && hasPendingFeed;

  const rejectedTitle =
    platform === 'prom'
      ? t('exportNotFoundPromTitle')
      : t('exportNotFoundHoroshopTitle');

  const rejectedDesc =
    stats?.message ||
    (platform === 'prom'
      ? t('exportNotFoundPromDesc')
      : t('exportNotFoundHoroshopDesc'));

  const successTitle = isPartial
    ? t('exportCompletedPartial')
    : t('exportCompletedSuccess');

  const successDesc =
    stats?.message
      ? stats.message
      : (stats?.errors ?? 0) > 0
      ? t('exportCompletedIssuesDesc')
      : t('exportCompletedDefaultDesc');

  const handleCopyFeed = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopiedFeed(true);
      setTimeout(() => setCopiedFeed(false), 2000);
    } catch (e) {
      console.error('Failed to copy feed url', e);
    }
  };

  return (
    <div className="py-2 space-y-6 text-center" id="export-completed-screen">
      {isRejected ? (
        <div className="space-y-3">
          <div className="warning-badge-glow">
            <AlertTriangle size={32} className="text-amber" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-primary">{rejectedTitle}</h3>
            <p className="text-sm text-secondary max-w-md mx-auto leading-relaxed">
              {rejectedDesc}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={isPartial ? 'warning-badge-glow' : 'success-badge-glow'}>
            <CheckCircle2 size={36} className={isPartial ? 'text-amber' : 'text-emerald'} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-primary">{successTitle}</h3>
            <p className="text-sm text-secondary max-w-md mx-auto leading-relaxed">
              {successDesc}
            </p>
          </div>
        </div>
      )}

      {stats && (
        <div className="stat-grid">
          <StatBox
            icon={Layers}
            iconColor="text-indigo"
            label={t('exportStatExported')}
            value={stats.totalExported ?? 0}
          />

          {hasPendingFeed ? (
            <StatBox
              icon={Clock}
              iconColor="text-amber"
              label={t('exportStatPendingFeed')}
              value={stats.pendingFeedCount ?? 0}
              valueColor="text-amber"
            />
          ) : (
            <StatBox
              icon={Sparkles}
              iconColor="text-emerald"
              label={t('exportStatNew')}
              value={stats.created ?? 0}
              valueColor="text-emerald"
            />
          )}

          <StatBox
            icon={RefreshCw}
            iconColor="text-sky"
            label={t('exportStatUpdated')}
            value={stats.updated ?? 0}
            valueColor="text-sky"
          />

          <StatBox
            icon={AlertCircle}
            iconColor={(stats.errors ?? 0) > 0 ? 'text-rose' : 'text-muted'}
            label={t('exportStatErrors')}
            value={stats.errors ?? 0}
            valueColor={(stats.errors ?? 0) > 0 ? 'text-rose' : 'text-muted'}
          />
        </div>
      )}

      {hasPendingFeed && feedUrl && (
        <div
          className="p-3 rounded-lg bg-elevated border border-indigo/20 text-left space-y-2"
          id="prom-feed-notice-box"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Layers size={14} className="text-indigo flex-shrink-0" />
            <span>{t('promFeedActionNotice')}</span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            {t('promFeedActionHelp')}
          </p>
          <div className="flex items-center justify-between gap-2 bg-surface p-2 rounded border border-subtle min-w-0">
            <span className="text-[11px] font-mono text-secondary truncate" title={feedUrl}>
              {feedUrl}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--sm text-xs gap-1.5 flex-shrink-0"
              onClick={handleCopyFeed}
            >
              {copiedFeed ? (
                <Check size={13} className="text-emerald" />
              ) : (
                <Copy size={13} />
              )}
              <span>{copiedFeed ? t('copied') : t('copyFeedLink')}</span>
            </button>
          </div>
        </div>
      )}

      {stats?.durationMs && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <div className="duration-pill">
            <Clock size={13} className="text-muted" />
            <span>
              {t('exportExecutionTime')}{' '}
              <strong className="text-primary font-mono font-semibold">
                {(stats.durationMs / 1000).toFixed(1)}s
              </strong>
            </span>
          </div>
          <div className="duration-pill">
            <Zap size={12} className="text-indigo" />
            <span>BullMQ</span>
          </div>
        </div>
      )}

      {stats?.errorDetails && stats.errorDetails.length > 0 && (
        <div
          className="mt-3 text-left border border-rose/20 bg-rose/5 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1.5"
          id="export-error-details-list"
        >
          <div className="text-[11px] font-semibold text-rose uppercase tracking-wider">
            {platform === 'prom'
              ? t('exportPromRemarks')
              : t('exportHoroshopRemarks')}
          </div>
          {stats.errorDetails.map((err, i) => (
            <div key={i} className="text-[11px] text-muted leading-tight">
              <span className="font-semibold text-primary">SKU {err.article}:</span> {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
