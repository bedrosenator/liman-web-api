import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useLanguage } from '@/context/LanguageContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { language } = useLanguage();

  const isDark = theme === 'dark';
  const tooltipText = isDark
    ? language === 'ru'
      ? 'Переключить на светлую тему'
      : 'Перемкнути на світлу тему'
    : language === 'ru'
    ? 'Переключить на тёмную тему'
    : 'Перемкнути на темну тему';

  return (
    <button
      type="button"
      id="theme-toggle-btn"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={tooltipText}
      title={tooltipText}
      data-tooltip={tooltipText}
      data-tooltip-pos="bottom"
    >
      {isDark ? (
        <Sun size={17} className="text-amber" />
      ) : (
        <Moon size={17} className="text-indigo" />
      )}
    </button>
  );
}
