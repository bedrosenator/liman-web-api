import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ImportErrorScreenProps {
  errorMessage: string | null;
}

export const ImportErrorScreen: React.FC<ImportErrorScreenProps> = ({
  errorMessage,
}) => {
  const { language } = useLanguage();

  return (
    <div className="py-4 space-y-4 text-center" id="import-error-box">
      <div className="w-12 h-12 bg-rose/10 border border-rose/30 rounded-full flex items-center justify-center mx-auto text-rose">
        <AlertCircle size={28} />
      </div>
      <div>
        <h3 className="text-base font-bold text-primary mb-1">
          {language === 'uk' ? 'Помилка імпорту каталогу' : 'Ошибка импорта каталога'}
        </h3>
        <p className="text-xs text-rose max-w-sm mx-auto">{errorMessage}</p>
      </div>
    </div>
  );
};
