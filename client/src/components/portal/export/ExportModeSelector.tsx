import React from 'react';
import { Zap, Sparkles, RefreshCw, Check } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { ExportMode } from './types';

interface ExportModeSelectorProps {
  mode: ExportMode;
  onModeChange: (mode: ExportMode) => void;
}

export const ExportModeSelector: React.FC<ExportModeSelectorProps> = ({
  mode,
  onModeChange,
}) => {
  const { language } = useLanguage();

  return (
    <div>
      <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
        {language === 'uk' ? 'Режим вивантаження' : 'Режим выгрузки'}
      </label>

      <div className="mode-cards-grid">
        {/* Режим 1: Полная выгрузка */}
        <label
          htmlFor="radio-mode-full-overwrite"
          className={`mode-card mode-card--emerald ${
            mode === 'full_overwrite' ? 'mode-card--active' : ''
          }`}
          id="mode-full-overwrite"
          onClick={() => onModeChange('full_overwrite')}
        >
          <input
            type="radio"
            id="radio-mode-full-overwrite"
            name="exportMode"
            value="full_overwrite"
            checked={mode === 'full_overwrite'}
            onChange={() => onModeChange('full_overwrite')}
            className="sr-only"
          />
          <div className="mode-card__header">
            <div className="mode-card__title-wrap">
              <Zap size={16} className="text-emerald" />
              <span className="mode-card__title">
                {language === 'uk' ? 'Всі товари' : 'Все товары'}
              </span>
            </div>
            <div className="mode-card__radio" aria-hidden="true">
              {mode === 'full_overwrite' ? (
                <Check size={12} strokeWidth={3} className="text-white" />
              ) : null}
            </div>
          </div>
          <p className="mode-card__desc">
            {language === 'uk'
              ? 'Повне оновлення та експорт всього каталогу'
              : 'Полное обновление и экспорт всего каталога'}
          </p>
        </label>

        {/* Режим 2: Только новинки */}
        <label
          htmlFor="radio-mode-only-new"
          className={`mode-card mode-card--indigo ${
            mode === 'only_new' ? 'mode-card--active' : ''
          }`}
          id="mode-only-new"
          onClick={() => onModeChange('only_new')}
        >
          <input
            type="radio"
            id="radio-mode-only-new"
            name="exportMode"
            value="only_new"
            checked={mode === 'only_new'}
            onChange={() => onModeChange('only_new')}
            className="sr-only"
          />
          <div className="mode-card__header">
            <div className="mode-card__title-wrap">
              <Sparkles size={16} className="text-indigo" />
              <span className="mode-card__title">
                {language === 'uk' ? 'Тільки новинки' : 'Только новинки'}
              </span>
            </div>
            <div className="mode-card__radio" aria-hidden="true">
              {mode === 'only_new' ? (
                <Check size={12} strokeWidth={3} className="text-white" />
              ) : null}
            </div>
          </div>
          <p className="mode-card__desc">
            {language === 'uk'
              ? 'Вивантажити лише нові, ще не створені позиції'
              : 'Выгрузить только новые, еще не созданные позиции'}
          </p>
        </label>

        {/* Режим 3: Обновление существующих */}
        <label
          htmlFor="radio-mode-update-existing"
          className={`mode-card mode-card--sky ${
            mode === 'update_existing' ? 'mode-card--active' : ''
          }`}
          id="mode-update-existing"
          onClick={() => onModeChange('update_existing')}
        >
          <input
            type="radio"
            id="radio-mode-update-existing"
            name="exportMode"
            value="update_existing"
            checked={mode === 'update_existing'}
            onChange={() => onModeChange('update_existing')}
            className="sr-only"
          />
          <div className="mode-card__header">
            <div className="mode-card__title-wrap">
              <RefreshCw size={16} className="text-sky" />
              <span className="mode-card__title">
                {language === 'uk' ? 'Оновити існуючі' : 'Обновить сущ.'}
              </span>
            </div>
            <div className="mode-card__radio" aria-hidden="true">
              {mode === 'update_existing' ? (
                <Check size={12} strokeWidth={3} className="text-white" />
              ) : null}
            </div>
          </div>
          <p className="mode-card__desc">
            {language === 'uk'
              ? 'Оновити дані тільки раніше прив’язаних товарів'
              : 'Обновить данные только ранее привязанных товаров'}
          </p>
        </label>
      </div>
    </div>
  );
};
