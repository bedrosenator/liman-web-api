import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import type { ExportCategory } from './types';

interface ExportAdvancedSettingsProps {
  defaultCategoryPath: string;
  setDefaultCategoryPath: (val: string) => void;
  categoriesList: ExportCategory[];
  loadingCategories: boolean;
  defaultBrand: string;
  setDefaultBrand: (val: string) => void;
  currency: string;
  setCurrency: (val: string) => void;
  limit: number | '';
  setLimit: (val: number | '') => void;
}

export const ExportAdvancedSettings: React.FC<ExportAdvancedSettingsProps> = ({
  defaultCategoryPath,
  setDefaultCategoryPath,
  categoriesList,
  loadingCategories,
  defaultBrand,
  setDefaultBrand,
  currency,
  setCurrency,
  limit,
  setLimit,
}) => {
  const { language } = useLanguage();

  return (
    <div className="space-y-4">
      {/* Выбор целевой/дефолтной категории в Хорошоп */}
      <div>
        <label
          htmlFor="export-default-category-select"
          className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1"
        >
          {language === 'uk'
            ? 'Цільова категорія в Хорошоп (для новинок)'
            : 'Целевая категория в Хорошоп (для новинок)'}
        </label>
        <select
          id="export-default-category-select"
          value={defaultCategoryPath}
          onChange={(e) => setDefaultCategoryPath(e.target.value)}
          className="input input--sm w-full"
          disabled={loadingCategories}
        >
          <option value="">
            {loadingCategories
              ? (language === 'uk'
                  ? 'Завантаження категорій Хорошоп...'
                  : 'Загрузка категорий Хорошоп...')
              : (language === 'uk'
                  ? '⚡ Автовизначення за назвою з Limansoft'
                  : '⚡ Автоопределение по названию из Limansoft')}
          </option>
          {categoriesList.map((cat) => (
            <option key={cat.id} value={cat.fullPath}>
              {cat.fullPath}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-muted">
          {language === 'uk'
            ? 'Хорошоп вимагає категорію з шаблоном для кожного нового товару. Якщо групу з Limansoft не знайдено на сайті, товар буде збережено в цій категорії.'
            : 'Хорошоп требует категорию с шаблоном для каждого нового товара. Если группу из Limansoft не найдено на сайте, товар будет сохранен в этой категории.'}
        </span>
      </div>

      {/* Бренд по умолчанию и Валюта */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="export-default-brand-input"
            className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1"
          >
            {language === 'uk' ? 'Бренд за замовчуванням' : 'Бренд по умолчанию'}
          </label>
          <input
            type="text"
            id="export-default-brand-input"
            placeholder={language === 'uk' ? 'Наприклад, Columb' : 'Например, Columb'}
            value={defaultBrand}
            onChange={(e) => setDefaultBrand(e.target.value)}
            className="input input--sm w-full"
          />
          <span className="text-[11px] text-muted">
            {language === 'uk'
              ? 'Пріоритет: поле з бази Liman → автовизначення з назви → бренд за замовчуванням.'
              : 'Приоритет: поле из базы Liman → автоопределение по названию → бренд по умолчанию.'}
          </span>
        </div>

        <div>
          <label
            htmlFor="export-currency-select"
            className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1"
          >
            {language === 'uk' ? 'Валюта товарів' : 'Валюта товаров'}
          </label>
          <select
            id="export-currency-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="input input--sm w-full"
          >
            <option value="UAH">UAH (₴ Гривня)</option>
            <option value="USD">USD ($ Долар)</option>
            <option value="EUR">EUR (€ Євро)</option>
          </select>
          <span className="text-[11px] text-muted">
            {language === 'uk'
              ? 'Валюта цін при експорті в Хорошоп (за замовчуванням UAH).'
              : 'Валюта цен при экспорте в Хорошоп (по умолчанию UAH).'}
          </span>
        </div>
      </div>

      {/* Ограничение количества */}
      <div>
        <label
          htmlFor="export-limit-input"
          className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1"
        >
          {language === 'uk' ? 'Тестовий ліміт (необов’язково)' : 'Тестовый лимит (необязательно)'}
        </label>
        <input
          type="number"
          id="export-limit-input"
          placeholder={language === 'uk' ? 'Наприклад, 50 позицій' : 'Например, 50 позиций'}
          value={limit}
          onChange={(e) => {
            const val = e.target.value;
            setLimit(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
          }}
          className="input input--sm w-full font-mono"
        />
        <span className="text-[11px] text-muted">
          {language === 'uk'
            ? 'Залиште порожнім для експорту всієї бази Limansoft'
            : 'Оставьте пустым для экспорта всей базы Limansoft'}
        </span>
      </div>
    </div>
  );
};
