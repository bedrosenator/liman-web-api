import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { translations, type Language, type TranslationKey } from '@/i18n/translations';

const STORAGE_KEY = 'liman_lang';

/**
 * Автоопределение языка браузера.
 * Если в navigator.language содержится 'uk' — возвращаем UK, иначе RU.
 */
function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'ru';
  const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
  if (stored === 'ru' || stored === 'uk') return stored;
  const nav = navigator.language?.toLowerCase() ?? '';
  return nav.startsWith('uk') ? 'uk' : 'ru';
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectBrowserLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return (translations[language][key] as string) ?? (translations['ru'][key] as string) ?? key;
    },
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Хук для получения языкового контекста.
 * Выбрасывает ошибку если используется вне LanguageProvider.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

export { STORAGE_KEY };
