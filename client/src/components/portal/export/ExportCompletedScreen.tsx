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
import type { ExportStats } from './types';

interface ExportCompletedScreenProps {
  stats: ExportStats | null;
}

export const ExportCompletedScreen: React.FC<ExportCompletedScreenProps> = ({
  stats,
}) => {
  const { language } = useLanguage();

  const isRejectedByHoroshop =
    stats &&
    (stats.errors ?? 0) > 0 &&
    (stats.created ?? 0) === 0 &&
    (stats.updated ?? 0) === 0;

  return (
    <div className="py-2 space-y-5 text-center" id="export-completed-screen">
      {isRejectedByHoroshop ? (
        <>
          <div className="warning-badge-glow">
            <AlertTriangle size={32} className="text-amber" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-primary">
              {language === 'uk' ? 'Товари відхилено Хорошопом' : 'Товары отклонены Хорошопом'}
            </h3>
            <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
              {language === 'uk'
                ? 'Хорошоп відхилив позиції (категорія не знайдена або відсутній шаблон). Оберіть цільову категорію в налаштуваннях вивантаження.'
                : 'Хорошоп отклонил позиции (категория не найдена или отсутствует шаблон). Выберите целевую категорию в настройках выгрузки.'}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="success-badge-glow">
            <CheckCircle2 size={36} className="text-emerald" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-primary">
              {language === 'uk' ? 'Каталог успішно експортовано!' : 'Каталог успешно экспортирован!'}
            </h3>
            <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
              {stats && (stats.errors ?? 0) > 0
                ? (language === 'uk'
                    ? 'Частину позицій збережено, але виникли зауваження до окремих товарів.'
                    : 'Часть позиций сохранена, но возникли замечания по отдельным товарам.')
                : (language === 'uk'
                    ? 'Дані товарів та зв’язки product_mappings успішно оновлено.'
                    : 'Данные товаров и связи product_mappings успешно обновлены.')}
            </p>
          </div>
        </>
      )}

      {stats && (
        <div className="stat-grid">
          <div className="stat-box">
            <div className="stat-box__header">
              <Layers size={13} className="text-indigo" />
              <span className="stat-box__label">{language === 'uk' ? 'Вивантажено' : 'Выгружено'}</span>
            </div>
            <div className="stat-box__value">
              {stats.totalExported ?? 0}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-box__header">
              <Sparkles size={13} className="text-emerald" />
              <span className="stat-box__label">{language === 'uk' ? 'Новинок' : 'Новинок'}</span>
            </div>
            <div className="stat-box__value text-emerald">
              {stats.created ?? 0}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-box__header">
              <RefreshCw size={13} className="text-sky" />
              <span className="stat-box__label">{language === 'uk' ? 'Оновлено' : 'Обновлено'}</span>
            </div>
            <div className="stat-box__value text-sky">
              {stats.updated ?? 0}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-box__header">
              <AlertCircle size={13} className={(stats.errors ?? 0) > 0 ? 'text-rose' : 'text-muted'} />
              <span className="stat-box__label">{language === 'uk' ? 'Помилок' : 'Ошибок'}</span>
            </div>
            <div className={`stat-box__value ${(stats.errors ?? 0) > 0 ? 'text-rose' : 'text-muted'}`}>
              {stats.errors ?? 0}
            </div>
          </div>
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
            {language === 'uk' ? 'Деталі зауважень Хорошоп:' : 'Детали замечаний Хорошоп:'}
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
