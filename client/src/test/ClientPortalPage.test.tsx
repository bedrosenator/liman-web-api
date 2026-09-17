import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ClientPortalPage } from '@/pages/ClientPortalPage';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { tenantsApi, horoshopApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  tenantsApi: {
    get: vi.fn(),
    ping: vi.fn(),
  },
  horoshopApi: {
    ping: vi.fn(),
    syncPricesStocks: vi.fn(),
    syncPricesStocksAsync: vi.fn(),
    getActivity: vi.fn(),
    saveSettings: vi.fn(),
    importCatalog: vi.fn(),
  },
  syncApi: {
    getJobStatus: vi.fn(),
  },
}));

const mockTenant = {
  id: 'columb',
  name: 'Columb Shop',
  horoshopDomain: 'shop724088.horoshop.ua',
  horoshopLogin: 'liman_api',
  horoshopExportEnabled: true,
  horoshopSyncIntervalMinutes: 15,
};

const mockActivities = [
  {
    id: 'act-1',
    timestamp: new Date().toISOString(),
    type: 'sync',
    status: 'success',
    titleRu: 'Синхронизация цен и остатков завершена',
    titleUk: 'Синхронізація цін та залишків завершена',
    detailsRu: '5 768 товаров обновлено',
    detailsUk: '5 768 товарів оновлено',
  },
];

function renderPortal() {
  return render(
    <AuthProvider>
      <LanguageProvider>
        <MemoryRouter initialEntries={['/portal/columb']}>
          <Routes>
            <Route path="/portal/:tenantId" element={<ClientPortalPage />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </AuthProvider>,
  );
}

describe('ClientPortalPage (TASK-20)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('liman_lang', 'ru');
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(tenantsApi.get).mockResolvedValue({ data: mockTenant } as any);
    vi.mocked(tenantsApi.ping).mockResolvedValue({
      data: { success: true, pingMs: 12, message: 'Connected' },
    } as any);
    vi.mocked(horoshopApi.ping).mockResolvedValue({
      data: { success: true, domain: 'shop724088.horoshop.ua' },
    } as any);
    vi.mocked(horoshopApi.getActivity).mockResolvedValue({
      data: mockActivities,
    } as any);
  });

  it('рендерит диагностический блок «Светофор» (3-Point Health Bar)', async () => {
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('База Limansoft')).toBeInTheDocument();
      expect(screen.getByText('Магазин Хорошоп')).toBeInTheDocument();
      expect(screen.getAllByText('Автосинхронизация').length).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      expect(screen.getByText('На связи')).toBeInTheDocument();
      expect(screen.getByText('Авторизован')).toBeInTheDocument();
      expect(screen.getByText('Включена')).toBeInTheDocument();
    });
  });

  it('вызывает syncPricesStocks при клике на кнопку немедленного обновления цен и остатков', async () => {
    vi.mocked(horoshopApi.syncPricesStocksAsync).mockResolvedValue({
      data: { success: true, updated: 5768, processed: 5768 },
    } as any);

    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Columb Shop')).toBeInTheDocument();
    });

    const syncBtn = screen.getByRole('button', { name: /Обновить остатки и цены сейчас/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(horoshopApi.syncPricesStocksAsync).toHaveBeenCalledWith('columb');
      expect(screen.getAllByText(/Успешно обновлено 5768 товаров в Хорошоп/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('отображает ссылку на XML-фид каталога и позволяет скопировать её', async () => {
    // Mock navigator.clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderPortal();

    await waitFor(() => {
      expect(screen.getByText(/horoshop\/columb\/feed\.xml/)).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /Скопировать ссылку на фид/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/horoshop/columb/feed.xml'));
  });

  it('отображает и позволяет раскрывать мастер онбординга (3-Step Wizard)', async () => {
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Мастер быстрого подключения Хорошоп')).toBeInTheDocument();
    });

    const wizardCard = screen.getByText('Мастер быстрого подключения Хорошоп');
    fireEvent.click(wizardCard);

    await waitFor(() => {
      expect(screen.getByText('Шаг 1: Создайте API-пользователя')).toBeInTheDocument();
      expect(screen.getByText('Шаг 2: Укажите реквизиты доступа')).toBeInTheDocument();
      expect(screen.getByText('Шаг 3: Подключите XML-каталог')).toBeInTheDocument();
    });
  });

  it('сохраняет настройки API через форму', async () => {
    vi.mocked(horoshopApi.saveSettings).mockResolvedValue({ data: { success: true } } as any);

    renderPortal();

    await waitFor(() => {
      expect(screen.getByDisplayValue('shop724088.horoshop.ua')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Сохранить/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(horoshopApi.saveSettings).toHaveBeenCalledWith(
        'columb',
        expect.objectContaining({
          horoshopDomain: 'shop724088.horoshop.ua',
          horoshopLogin: 'liman_api',
          horoshopExportEnabled: true,
        }),
      );
    });
  });

  it('отображает официальное название магазина Хорошоп (TASK-26)', async () => {
    vi.mocked(tenantsApi.get).mockResolvedValueOnce({
      data: {
        ...mockTenant,
        horoshopShopTitle: 'Columb Store Official 2026',
      },
    } as any);

    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Columb Store Official 2026')).toBeInTheDocument();
    });
  });

  it('открывает модальное окно прямого экспорта каталога по кнопке в Action Hub (TASK-26)', async () => {
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText(/Экспортировать каталог в Хорошоп/i)).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /Экспортировать каталог в Хорошоп/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText('Прямой экспорт каталога в Хорошоп')).toBeInTheDocument();
      expect(screen.getByText('Все товары')).toBeInTheDocument();
    });
  });
});
