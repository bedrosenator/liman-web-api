import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageProvider } from '@/context/LanguageContext';

function TestComponent() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>Toggle</button>
      <ThemeToggle />
    </div>
  );
}

describe('ThemeContext and ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('по умолчанию инициализирует тему как dark', () => {
    render(
      <ThemeProvider>
        <LanguageProvider>
          <TestComponent />
        </LanguageProvider>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('переключает тему между dark и light по клику', () => {
    render(
      <ThemeProvider>
        <LanguageProvider>
          <TestComponent />
        </LanguageProvider>
      </ThemeProvider>,
    );

    const toggleBtn = screen.getByRole('button', { name: /светлую тему/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId('theme-value')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('liman_theme')).toBe('light');

    // Кликаем повторно для возврата в dark
    const toggleBackBtn = screen.getByRole('button', { name: /тёмную тему/i });
    fireEvent.click(toggleBackBtn);

    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('liman_theme')).toBe('dark');
  });
});
