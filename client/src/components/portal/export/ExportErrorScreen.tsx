import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { ModalErrorScreen } from '../common';

interface ExportErrorScreenProps {
  errorMessage: string | null;
}

export const ExportErrorScreen: React.FC<ExportErrorScreenProps> = ({
  errorMessage,
}) => {
  const { language } = useLanguage();

  return (
    <ModalErrorScreen
      id="export-error-screen"
      title={
        language === 'uk'
          ? 'Помилка експорту каталогу'
          : 'Ошибка экспорта каталога'
      }
      errorMessage={errorMessage}
    />
  );
};
