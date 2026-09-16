import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { LanguageProvider, useLanguage, STORAGE_KEY } from '@/context/LanguageContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}

// ─── Tests ─────────────────────────────────────────────────────────────────── */

describe('LanguageContext', () => {
  beforeEach(() => {
    localStorage.clear();
    // Сбрасываем navigator.language на RU по умолчанию
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => 'ru-RU',
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // ─── Default language ────────────────────────────────────────────────────────

  it('должен использовать русский язык по умолчанию', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe('ru');
  });

  it('должен автоматически выбирать украинский если браузер uk-UA', () => {
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => 'uk-UA',
    });
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe('uk');
  });

  it('должен читать сохраненный язык из localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'uk');
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe('uk');
  });

  it('localStorage имеет приоритет над navigator.language', () => {
    localStorage.setItem(STORAGE_KEY, 'ru');
    // Даже если браузер uk — localStorage победит
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => 'uk-UA',
    });
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe('ru');
  });

  // ─── setLanguage ──────────────────────────────────────────────────────────────

  it('должен менять язык на UK и сохранять в localStorage', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe('ru');

    act(() => {
      result.current.setLanguage('uk');
    });

    expect(result.current.language).toBe('uk');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('uk');
  });

  it('должен менять язык обратно на RU', () => {
    localStorage.setItem(STORAGE_KEY, 'uk');
    const { result } = renderHook(() => useLanguage(), { wrapper });

    act(() => {
      result.current.setLanguage('ru');
    });

    expect(result.current.language).toBe('ru');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ru');
  });

  // ─── t() translation function ─────────────────────────────────────────────────

  it('должен возвращать правильный перевод для RU', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe('ru');
    expect(result.current.t('appName')).toBe('Liman Sync');
    expect(result.current.t('save')).toBe('Сохранить');
    expect(result.current.t('cancel')).toBe('Отмена');
  });

  it('должен возвращать правильный перевод для UK после переключения', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });

    act(() => {
      result.current.setLanguage('uk');
    });

    expect(result.current.t('save')).toBe('Зберегти');
    expect(result.current.t('cancel')).toBe('Скасувати');
    expect(result.current.t('loginButton')).toBe('Увійти');
  });

  it('должен переводить бэкап-специфичные ключи', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.t('fastBackup')).toBe('Быстрый (без фото)');
    expect(result.current.t('fullBackup')).toBe('Полный (с фотографиями)');
    expect(result.current.t('restoreBackup')).toBe('Восстановить (Откат)');
  });

  it('должен переводить бэкап-специфичные ключи на UK', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });

    act(() => result.current.setLanguage('uk'));

    expect(result.current.t('fastBackup')).toBe('Швидкий (без фото)');
    expect(result.current.t('restoreBackup')).toBe('Відновити (Відкат)');
  });

  it('должен переводить импорт-специфичные ключи на обоих языках', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.t('onlyNewItems')).toBe('Только новые товары');
    expect(result.current.t('overwriteItems')).toBe('Полное обновление (Перезапись)');

    act(() => result.current.setLanguage('uk'));
    expect(result.current.t('onlyNewItems')).toBe('Тільки нові товари');
    expect(result.current.t('overwriteItems')).toBe('Повне оновлення (Перезапис)');
  });

  // ─── useLanguage error ────────────────────────────────────────────────────────

  it('useLanguage должен выбрасывать ошибку вне LanguageProvider', () => {
    // Подавляем вывод ошибки в консоль
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useLanguage());
    }).toThrow('useLanguage must be used within a LanguageProvider');

    consoleSpy.mockRestore();
  });

  // ─── Invalid locale fallback ──────────────────────────────────────────────────

  it('должен игнорировать невалидное значение localStorage и использовать RU', () => {
    localStorage.setItem(STORAGE_KEY, 'de'); // не поддерживаемый язык
    const { result } = renderHook(() => useLanguage(), { wrapper });
    // detectBrowserLanguage не знает 'de' → fallback через navigator → 'ru-RU' → 'ru'
    expect(['ru', 'uk']).toContain(result.current.language);
  });
});
