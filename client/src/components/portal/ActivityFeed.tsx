import { useLanguage } from '@/context/LanguageContext';
import { Clock, AlertCircle, RefreshCw, ShoppingCart, FileCode, Zap } from 'lucide-react';

export interface ActivityItem {
  id: string;
  timestamp: string;
  type: 'sync' | 'order' | 'feed' | 'ping';
  status: 'success' | 'warning' | 'error';
  titleRu: string;
  titleUk: string;
  detailsRu?: string;
  detailsUk?: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function ActivityFeed({ activities, isLoading, onRefresh }: ActivityFeedProps) {
  const { language, t } = useLanguage();

  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const locale = language === 'uk' ? 'uk-UA' : 'ru-RU';
      const datePart = d.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const timePart = d.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `${datePart}, ${timePart}`;
    } catch {
      return isoString;
    }
  };

  const sortedActivities = [...activities].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime() || 0;
    const timeB = new Date(b.timestamp).getTime() || 0;
    return timeB - timeA;
  });

  const getIcon = (type: string, status: string) => {
    switch (type) {
      case 'order':
        return <ShoppingCart size={16} className="text-indigo" />;
      case 'feed':
        return <FileCode size={16} className="text-sky" />;
      case 'sync':
      default:
        return status === 'error' ? (
          <AlertCircle size={16} className="text-rose" />
        ) : (
          <Zap size={16} className="text-emerald" />
        );
    }
  };

  return (
    <div className="card" id="activity-feed-section">
      <div className="card__header flex justify-between items-center">
        <h3 className="card__title">
          <Clock size={18} className="text-muted flex-shrink-0" />
          <span>{t('activityTitle')}</span>
        </h3>
        {onRefresh && (
          <button
            type="button"
            className="btn-icon btn-icon--xs"
            onClick={onRefresh}
            disabled={isLoading}
            title={t('refresh')}
          >
            <RefreshCw size={14} className={isLoading ? 'spinner' : ''} />
          </button>
        )}
      </div>

      <div className="card__body p-0">
        {sortedActivities.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted">
            {t('activityEmpty')}
          </div>
        ) : (
          <ul className="divide-y divide-subtle">
            {sortedActivities.map((item) => (
              <li key={item.id} className="p-3 flex items-start gap-3 hover:bg-elevated transition-colors">
                <div className="mt-0.5">{getIcon(item.type, item.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-primary truncate">
                      {language === 'uk' ? item.titleUk : item.titleRu}
                    </p>
                    <span className="text-[11px] font-mono text-muted flex-shrink-0">
                      {formatDateTime(item.timestamp)}
                    </span>
                  </div>
                  {(item.detailsRu || item.detailsUk) && (
                    <p className="text-[11px] text-secondary mt-0.5 line-clamp-2">
                      {language === 'uk' ? item.detailsUk : item.detailsRu}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
