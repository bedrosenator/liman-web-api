import React from 'react';
import {
  DollarSign,
  Package,
  FolderTree,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { CheckboxField } from '../common';

interface ExportFieldTogglesProps {
  exportPrices: boolean;
  setExportPrices: (val: boolean) => void;
  exportStock: boolean;
  setExportStock: (val: boolean) => void;
  exportCategories: boolean;
  setExportCategories: (val: boolean) => void;
  exportImages: boolean;
  setExportImages: (val: boolean) => void;
  exportDescriptions: boolean;
  setExportDescriptions: (val: boolean) => void;
}

export const ExportFieldToggles: React.FC<ExportFieldTogglesProps> = ({
  exportPrices,
  setExportPrices,
  exportStock,
  setExportStock,
  exportCategories,
  setExportCategories,
  exportImages,
  setExportImages,
  exportDescriptions,
  setExportDescriptions,
}) => {
  const { language } = useLanguage();

  return (
    <div>
      <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
        {language === 'uk' ? 'Дані для синхронізації' : 'Данные для синхронизации'}
      </label>

      <div className="checkbox-grid">
        <CheckboxField
          id="checkbox-export-prices"
          checked={exportPrices}
          onChange={setExportPrices}
          icon={DollarSign}
          iconColor="text-emerald"
          label={language === 'uk' ? 'Актуальні ціни' : 'Актуальные цены'}
        />

        <CheckboxField
          id="checkbox-export-stock"
          checked={exportStock}
          onChange={setExportStock}
          icon={Package}
          iconColor="text-indigo"
          label={language === 'uk' ? 'Залишки на складі' : 'Остатки склада'}
        />

        <CheckboxField
          id="checkbox-export-categories"
          checked={exportCategories}
          onChange={setExportCategories}
          icon={FolderTree}
          iconColor="text-amber"
          label={language === 'uk' ? 'Дерево категорій' : 'Дерево категорий'}
        />

        <CheckboxField
          id="checkbox-export-images"
          checked={exportImages}
          onChange={setExportImages}
          icon={ImageIcon}
          iconColor="text-sky"
          label={language === 'uk' ? 'Посилання на фото' : 'Ссылки на фото'}
        />

        <CheckboxField
          id="checkbox-export-descriptions"
          checked={exportDescriptions}
          onChange={setExportDescriptions}
          icon={FileText}
          iconColor="text-indigo"
          label={language === 'uk' ? 'Описи товарів' : 'Описания товаров'}
        />
      </div>
    </div>
  );
};
