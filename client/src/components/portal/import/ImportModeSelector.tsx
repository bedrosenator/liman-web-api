import React from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { ModeCard } from '../common';
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
        <ModeCard
          id="mode-only-new"
          inputId="radio-mode-only-new"
          name="importMode"
          value="only_new"
          isActive={mode === 'only_new'}
          onSelect={() => onModeChange('only_new')}
          color="indigo"
          icon={ShieldCheck}
          iconSize={18}
          title={t('onlyNewItems')}
          description={t('onlyNewItemsDesc')}
        />

        <ModeCard
          id="mode-overwrite"
          inputId="radio-mode-overwrite"
          name="importMode"
          value="overwrite"
          isActive={mode === 'overwrite'}
          onSelect={() => onModeChange('overwrite')}
          color="rose"
          icon={AlertTriangle}
          iconSize={18}
          title={t('overwriteItems')}
          description={t('overwriteItemsDesc')}
        />
      </div>
    </div>
  );
};
