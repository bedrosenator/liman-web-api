import React from 'react';
import { DollarSign, Package, Image as ImageIcon, Database } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { CheckboxField } from '../common';

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
        <CheckboxField
          checked={updatePrices}
          onChange={setUpdatePrices}
          icon={DollarSign}
          iconColor="text-indigo"
          label={language === 'uk' ? 'Роздрібні ціни (cena2)' : 'Розничные цены (cena2)'}
        />

        <CheckboxField
          checked={updateStock}
          onChange={setUpdateStock}
          icon={Package}
          iconColor="text-emerald"
          label={language === 'uk' ? 'Складські залишки (skl_k)' : 'Складские остатки (skl_k)'}
        />

        <CheckboxField
          checked={updateImages}
          onChange={setUpdateImages}
          icon={ImageIcon}
          iconColor="text-sky"
          label={language === 'uk' ? 'Фотографії (namedesc)' : 'Фотографии (namedesc)'}
        />

        <CheckboxField
          checked={createBackup}
          onChange={setCreateBackup}
          icon={Database}
          iconColor="text-amber"
          label={<span className="truncate">{t('autoBackupBeforeSync')}</span>}
        />
      </div>
    </div>
  );
};
