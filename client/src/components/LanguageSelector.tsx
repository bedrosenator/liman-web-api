import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import type { Language } from '@/i18n/translations';

interface FlagProps { className?: string }

const FlagRU = ({ className }: FlagProps) => (
  <svg className={className} viewBox="0 0 20 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Russian" role="img">
    <rect width="20" height="4.67" fill="#FFFFFF" />
    <rect y="4.67" width="20" height="4.66" fill="#0039A6" />
    <rect y="9.33" width="20" height="4.67" fill="#D52B1E" />
  </svg>
);

const FlagUK = ({ className }: FlagProps) => (
  <svg className={className} viewBox="0 0 20 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Ukrainian" role="img">
    <rect width="20" height="7" fill="#005BBB" />
    <rect y="7" width="20" height="7" fill="#FFD500" />
  </svg>
);

const LANGUAGES: { code: Language; label: string; flag: (p: FlagProps) => React.ReactElement }[] = [
  { code: 'ru', label: 'RU', flag: FlagRU },
  { code: 'uk', label: 'UK', flag: FlagUK },
];

/**
 * Переключатель языка в шапке.
 * Отображает флаг и код текущего языка, по клику переключает.
 */
export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="lang-selector" role="group" aria-label="Language selector">
      {LANGUAGES.map(({ code, label, flag: Flag }) => (
        <button
          key={code}
          id={`lang-btn-${code}`}
          className={`lang-btn ${language === code ? 'lang-btn--active' : ''}`}
          onClick={() => setLanguage(code)}
          aria-pressed={language === code}
          aria-label={`Switch to ${label}`}
          title={label === 'RU' ? 'Русский' : 'Українська'}
        >
          <Flag className="lang-flag" />
          <span className="lang-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
