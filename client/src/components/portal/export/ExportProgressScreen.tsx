import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ExportProgressScreenProps {
  progress: number;
}

export const ExportProgressScreen: React.FC<ExportProgressScreenProps> = ({
  progress,
}) => {
  const { language } = useLanguage();

  return (
    <div className="py-8 text-center space-y-6" id="export-running-screen">
      <div className="relative w-20 h-20 mx-auto">
        <Loader2 size={80} className="spinner text-emerald mx-auto" />
        <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-sm text-primary">
          {progress}%
        </div>
      </div>

      <div>
        <h3 className="text-base font-bold text-primary mb-1">
          {language === 'uk' ? 'Експорт каталогу в Хорошоп...' : 'Экспорт каталога в Хорошоп...'}
        </h3>
        <p className="text-xs text-secondary">
          {language === 'uk'
            ? 'Фоновий воркер BullMQ пакетно відправляє товари в API /catalog/import/'
            : 'Фоновый воркер BullMQ пакетно отправляет товары в API /catalog/import/'}
        </p>
      </div>

      <div className="progress-track">
        <div
          className="progress-fill progress-fill--emerald"
          style={{ width: `${Math.max(5, progress)}%` }}
        />
      </div>
    </div>
  );
};
