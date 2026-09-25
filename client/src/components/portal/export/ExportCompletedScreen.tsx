import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { StatBox } from '../common';
import type { ExportStats } from './types';

interface ExportCompletedScreenProps {
  stats: ExportStats | null;
  platform?: 'horoshop' | 'prom';
}

export const ExportCompletedScreen: React.FC<ExportCompletedScreenProps> = ({
  stats,
  platform = 'horoshop',
}) => {
  const { language } = useLanguage();

  const isRejected =
    stats &&
    ((stats.errors ?? 0) > 0 || (stats.totalExported ?? 0) === 0) &&
    (stats.created ?? 0) === 0 &&
    (stats.updated ?? 0) === 0 &&
    ((stats.totalFetched ?? 0) > 0 || (stats.errors ?? 0) > 0);

  const rejectedTitle =
    platform === 'prom'
      ? (language === 'uk' ? 'Товари не знайдено в Prom.ua' : 'Товары не найдены в Prom.ua')
      : (language === 'uk' ? 'Товари відхилено Хорошопом' : 'Товары отклонены Хорошопом');

  const rejectedDesc =
    stats?.message ||
    (platform === 'prom'
      ? (language === 'uk'
          ? 'Товари відсутні в каталозі Prom.ua. Зареєструйте YML-фід у кабінеті продавця для початкового створення товарів.'
          : 'Товары отсутствуют в каталоге Prom.ua. Зарегистрируйте YML-фид в кабинете продавца для первоначального создания товаров.')
      : (language === 'uk'
          ? 'Хорошоп відхилив позиції (категорія не знайдена або відсутній шаблон). Оберіть цільову категорію в налаштуваннях вивантаження.'
          : 'Хорошоп отклонил позиции (категория не найдена или отсутствует шаблон). Выберите целевую категорию в настройках выгрузки.'));

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
          <div className="success-badge-glow">
            <CheckCircle2 size={36} className="text-emerald" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-primary">
              {language === 'uk' ? 'Каталог успішно експортовано!' : 'Каталог успешно экспортирован!'}
            </h3>
            <p className="text-sm text-secondary max-w-md mx-auto leading-relaxed">
              {stats?.message
                ? stats.message
                : stats && (stats.errors ?? 0) > 0
                ? (language === 'uk'
                    ? 'Частину позицій збережено, але виникли зауваження до окремих товарів.'
                    : 'Часть позиций сохранена, но возникли замечания по отдельным товарам.')
                : (language === 'uk'
                    ? 'Дані товарів та зв’язки product_mappings успішно оновлено.'
                    : 'Данные товаров и связи product_mappings успешно обновлены.')}
            </p>
          </div>
        </div>
      )}

      {stats && (
        <div className="stat-grid">
          <StatBox
            icon={Layers}
            iconColor="text-indigo"
            label={language === 'uk' ? 'Вивантажено' : 'Выгружено'}
            value={stats.totalExported ?? 0}
          />

          <StatBox
            icon={Sparkles}
            iconColor="text-emerald"
            label={language === 'uk' ? 'Новинок' : 'Новинок'}
            value={stats.created ?? 0}
            valueColor="text-emerald"
          />

          <StatBox
            icon={RefreshCw}
            iconColor="text-sky"
            label={language === 'uk' ? 'Оновлено' : 'Обновлено'}
            value={stats.updated ?? 0}
            valueColor="text-sky"
          />

          <StatBox
            icon={AlertCircle}
            iconColor={(stats.errors ?? 0) > 0 ? 'text-rose' : 'text-muted'}
            label={language === 'uk' ? 'Помилок' : 'Ошибок'}
            value={stats.errors ?? 0}
            valueColor={(stats.errors ?? 0) > 0 ? 'text-rose' : 'text-muted'}
          />
        </div>
      )}

      {stats?.durationMs && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <div className="duration-pill">
            <Clock size={13} className="text-muted" />
            <span>
              {language === 'uk' ? 'Час виконання:' : 'Время выполнения:'}{' '}
              <strong className="text-primary font-mono font-semibold">{(stats.durationMs / 1000).toFixed(1)}s</strong>
            </span>
          </div>
          <div className="duration-pill">
            <Zap size={12} className="text-indigo" />
            <span>BullMQ</span>
          </div>
        </div>
      )}

      {stats?.errorDetails && stats.errorDetails.length > 0 && (
        <div className="mt-3 text-left border border-rose/20 bg-rose/5 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1.5" id="export-error-details-list">
          <div className="text-[11px] font-semibold text-rose uppercase tracking-wider">
            {platform === 'prom'
              ? (language === 'uk' ? 'Деталі зауважень Prom.ua:' : 'Детали замечаний Prom.ua:')
              : (language === 'uk' ? 'Деталі зауважень Хорошоп:' : 'Детали замечаний Хорошоп:')}
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
