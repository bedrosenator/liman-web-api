import React from 'react';
import { Zap, Sparkles, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { ModeCard } from '../common';
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
        <ModeCard
          id="mode-full-overwrite"
          inputId="radio-mode-full-overwrite"
          name="exportMode"
          value="full_overwrite"
          isActive={mode === 'full_overwrite'}
          onSelect={() => onModeChange('full_overwrite')}
          color="emerald"
          icon={Zap}
          title={language === 'uk' ? 'Всі товари' : 'Все товары'}
          description={
            language === 'uk'
              ? 'Повне оновлення та експорт всього каталогу'
              : 'Полное обновление и экспорт всего каталога'
          }
        />

        <ModeCard
          id="mode-only-new"
          inputId="radio-mode-only-new"
          name="exportMode"
          value="only_new"
          isActive={mode === 'only_new'}
          onSelect={() => onModeChange('only_new')}
          color="indigo"
          icon={Sparkles}
          title={language === 'uk' ? 'Тільки новинки' : 'Только новинки'}
          description={
            language === 'uk'
              ? 'Вивантажити лише нові, ще не створені позиції'
              : 'Выгрузить только новые, еще не созданные позиции'
          }
        />

        <ModeCard
          id="mode-update-existing"
          inputId="radio-mode-update-existing"
          name="exportMode"
          value="update_existing"
          isActive={mode === 'update_existing'}
          onSelect={() => onModeChange('update_existing')}
          color="sky"
          icon={RefreshCw}
          title={language === 'uk' ? 'Оновити існуючі' : 'Обновить сущ.'}
          description={
            language === 'uk'
              ? 'Оновити дані тільки раніше прив’язаних товарів'
              : 'Обновить данные только ранее привязанных товаров'
          }
        />
      </div>
    </div>
  );
};
