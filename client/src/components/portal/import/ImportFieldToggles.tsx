import React from 'react';
import { DollarSign, Package, Image as ImageIcon, Database } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ImportFieldTogglesProps {
  updatePrices: boolean;
  setUpdatePrices: (val: boolean) => void;
  updateStock: boolean;
  setUpdateStock: (val: boolean) => void;
  updateImages: boolean;
  setUpdateImages: (val: boolean) => void;
  createBackup: boolean;
  setCreateBackup: (val: boolean) => void;
}

export const ImportFieldToggles: React.FC<ImportFieldTogglesProps> = ({
  updatePrices,
  setUpdatePrices,
  updateStock,
  setUpdateStock,
  updateImages,
  setUpdateImages,
  createBackup,
  setCreateBackup,
}) => {
  const { t, language } = useLanguage();

  return (
    <div>
      <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
        {language === 'uk' ? 'Параметри імпорту' : 'Параметры импорта'}
      </label>

      <div className="checkbox-grid">
        <label className="checkbox-item">
          <input
            type="checkbox"
            checked={updatePrices}
            onChange={(e) => setUpdatePrices(e.target.checked)}
          />
          <DollarSign size={14} className="text-indigo" />
          <span>{language === 'uk' ? 'Роздрібні ціни (cena2)' : 'Розничные цены (cena2)'}</span>
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            checked={updateStock}
            onChange={(e) => setUpdateStock(e.target.checked)}
          />
          <Package size={14} className="text-emerald" />
          <span>{language === 'uk' ? 'Складські залишки (skl_k)' : 'Складские остатки (skl_k)'}</span>
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            checked={updateImages}
            onChange={(e) => setUpdateImages(e.target.checked)}
          />
          <ImageIcon size={14} className="text-sky" />
          <span>{language === 'uk' ? 'Фотографії (namedesc)' : 'Фотографии (namedesc)'}</span>
        </label>

        <label className="checkbox-item">
          <input
            type="checkbox"
            checked={createBackup}
            onChange={(e) => setCreateBackup(e.target.checked)}
          />
          <Database size={14} className="text-amber" />
          <span className="truncate">{t('autoBackupBeforeSync')}</span>
        </label>
      </div>
    </div>
  );
};
