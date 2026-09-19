import React from 'react';
import { ShieldCheck, AlertTriangle, Check } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { ImportMode } from './types';

interface ImportModeSelectorProps {
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
}

export const ImportModeSelector: React.FC<ImportModeSelectorProps> = ({
  mode,
  onModeChange,
}) => {
  const { t } = useLanguage();

  return (
    <div>
      <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
        {t('importMode')}
      </label>

      <div className="mode-cards-grid mode-cards-grid--2">
        {/* Режим 1: Только новинки */}
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
            name="importMode"
            value="only_new"
            checked={mode === 'only_new'}
            onChange={() => onModeChange('only_new')}
            className="sr-only"
          />
          <div className="mode-card__header">
            <div className="mode-card__title-wrap">
              <ShieldCheck size={18} className="text-emerald" />
              <span className="mode-card__title">
                {t('onlyNewItems')}
              </span>
            </div>
            <div className="mode-card__radio" aria-hidden="true">
              {mode === 'only_new' ? (
                <Check size={12} strokeWidth={3} className="text-white" />
              ) : null}
            </div>
          </div>
          <p className="mode-card__desc">
            {t('onlyNewItemsDesc')}
          </p>
        </label>

        {/* Режим 2: Перезапись */}
        <label
          htmlFor="radio-mode-overwrite"
          className={`mode-card mode-card--rose ${
            mode === 'overwrite' ? 'mode-card--active' : ''
          }`}
          id="mode-overwrite"
          onClick={() => onModeChange('overwrite')}
        >
          <input
            type="radio"
            id="radio-mode-overwrite"
            name="importMode"
            value="overwrite"
            checked={mode === 'overwrite'}
            onChange={() => onModeChange('overwrite')}
            className="sr-only"
          />
          <div className="mode-card__header">
            <div className="mode-card__title-wrap">
              <AlertTriangle size={18} className="text-rose" />
              <span className="mode-card__title">
                {t('overwriteItems')}
              </span>
            </div>
            <div className="mode-card__radio" aria-hidden="true">
              {mode === 'overwrite' ? (
                <Check size={12} strokeWidth={3} className="text-white" />
              ) : null}
            </div>
          </div>
          <p className="mode-card__desc">
            {t('overwriteItemsDesc')}
          </p>
        </label>
      </div>
    </div>
  );
};
