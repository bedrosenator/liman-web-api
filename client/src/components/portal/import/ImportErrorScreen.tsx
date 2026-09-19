import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { ModalErrorScreen } from '../common';

interface ImportErrorScreenProps {
  errorMessage: string | null;
}

export const ImportErrorScreen: React.FC<ImportErrorScreenProps> = ({
  errorMessage,
}) => {
  const { language } = useLanguage();

  return (
    <ModalErrorScreen
      id="import-error-box"
      title={
        language === 'uk'
          ? 'Помилка імпорту каталогу'
          : 'Ошибка импорта каталога'
      }
      errorMessage={errorMessage}
    />
  );
};
