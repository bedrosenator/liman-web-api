import React from 'react';
import {
  DollarSign,
  Package,
  FolderTree,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

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
        <label className="checkbox-item" htmlFor="checkbox-export-prices">
          <input
            type="checkbox"
            checked={exportPrices}
            onChange={(e) => setExportPrices(e.target.checked)}
            id="checkbox-export-prices"
          />
          <DollarSign size={15} className="text-emerald" />
          <span>{language === 'uk' ? 'Актуальні ціни' : 'Актуальные цены'}</span>
        </label>

        <label className="checkbox-item" htmlFor="checkbox-export-stock">
          <input
            type="checkbox"
            checked={exportStock}
            onChange={(e) => setExportStock(e.target.checked)}
            id="checkbox-export-stock"
          />
          <Package size={15} className="text-indigo" />
          <span>{language === 'uk' ? 'Залишки на складі' : 'Остатки склада'}</span>
        </label>

        <label className="checkbox-item" htmlFor="checkbox-export-categories">
          <input
            type="checkbox"
            checked={exportCategories}
            onChange={(e) => setExportCategories(e.target.checked)}
            id="checkbox-export-categories"
          />
          <FolderTree size={15} className="text-amber" />
          <span>{language === 'uk' ? 'Дерево категорій' : 'Дерево категорий'}</span>
        </label>

        <label className="checkbox-item" htmlFor="checkbox-export-images">
          <input
            type="checkbox"
            checked={exportImages}
            onChange={(e) => setExportImages(e.target.checked)}
            id="checkbox-export-images"
          />
          <ImageIcon size={15} className="text-sky" />
          <span>{language === 'uk' ? 'Посилання на фото' : 'Ссылки на фото'}</span>
        </label>

        <label className="checkbox-item" htmlFor="checkbox-export-descriptions">
          <input
            type="checkbox"
            checked={exportDescriptions}
            onChange={(e) => setExportDescriptions(e.target.checked)}
            id="checkbox-export-descriptions"
          />
          <FileText size={15} className="text-indigo" />
          <span>{language === 'uk' ? 'Описи товарів' : 'Описания товаров'}</span>
        </label>
      </div>
    </div>
  );
};
