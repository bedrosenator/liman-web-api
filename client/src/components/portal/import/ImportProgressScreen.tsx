import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ImportProgressScreenProps {
  progress: number;
}

export const ImportProgressScreen: React.FC<ImportProgressScreenProps> = ({
  progress,
}) => {
  const { t, language } = useLanguage();

  return (
    <div className="py-8 text-center space-y-4" id="import-running-box">
      <Loader2 size={40} className="spinner text-indigo mx-auto" />
      <div>
        <h3 className="text-base font-semibold text-primary">{t('importRunning')}</h3>
        <p className="text-xs text-secondary mt-1">
          {language === 'uk'
            ? 'Фонова черга BullMQ безпечно обробляє товари каталогу без блокування сервера.'
            : 'Фоновая очередь BullMQ безопасно обрабатывает товары каталога без блокировки сервера.'}
        </p>
      </div>

      <div className="space-y-1.5 max-w-md mx-auto">
        <div className="flex justify-between text-xs text-muted font-mono">
          <span>{t('importProgress')}</span>
          <span>{progress}%</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill progress-fill--indigo"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
