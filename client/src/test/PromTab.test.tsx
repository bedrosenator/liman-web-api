import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PromTab } from '@/components/portal/PromTab';
import { LanguageProvider } from '@/context/LanguageContext';
import { promApi, limanApi, tenantsApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  promApi: {
    ping: vi.fn(),
    syncPricesStocksAsync: vi.fn(),
    getExportCategories: vi.fn().mockResolvedValue({ data: { categories: [] } }),
    exportCatalog: vi.fn(),
    importCatalog: vi.fn(),
  },
  limanApi: {
    ping: vi.fn(),
  },
  tenantsApi: {
    update: vi.fn(),
  },
  syncApi: {
    getJobStatus: vi.fn(),
  },
}));

const mockTenant = {
  id: 'columb',
  name: 'Columb Shop',
  promApiKey: 'test-prom-key',
  promShopTitle: 'Columb Official Prom',
  promExportEnabled: true,
  promSyncIntervalMinutes: 15,
  promOrderWebhookEnabled: true,
  promCreateOrderDocumentEnabled: false,
};

function renderComponent(props = {}) {
  const mergedProps = {
    tenantId: 'columb',
    tenant: mockTenant,
    onTenantUpdated: vi.fn(),
    ...props,
  };
  return render(
    <LanguageProvider>
      <PromTab {...mergedProps} />
    </LanguageProvider>,
  );
}

describe('PromTab (TASK-35)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('liman_lang', 'ru');
    vi.clearAllMocks();
    vi.mocked(limanApi.ping).mockResolvedValue({ data: { success: true } } as any);
    vi.mocked(promApi.ping).mockResolvedValue({
      data: { connected: true, shopTitle: 'Columb Official Prom' },
    } as any);
  });

  it('рендерит 3-Point Health Bar с MariaDB, Prom API и Автосинхронизацией', async () => {
    renderComponent();

    expect(screen.getByText('API Prom.ua')).toBeInTheDocument();
    expect(screen.getByText('База Limansoft')).toBeInTheDocument();
    expect(screen.getByText('Автосинхронизация')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('(Columb Official Prom)')).toBeInTheDocument();
    });
  });

  it('рендерит Action Hub с 3 карточками действий', () => {
    renderComponent();

    expect(screen.getByText('Синхронизировать остатки в Prom')).toBeInTheDocument();
    expect(screen.getByText('Импорт каталога Prom.ua')).toBeInTheDocument();
    expect(screen.getByText('Экспорт каталога в Prom.ua')).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: /Импорт из Prom.ua/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Экспорт в Prom.ua/i }),
    ).toBeInTheDocument();
  });

  it('открывает модальное окно экспорта при клике на Экспорт в Prom.ua', () => {
    renderComponent();

    const exportBtn = screen.getByRole('button', { name: /Экспорт в Prom.ua/i });
    fireEvent.click(exportBtn);

    expect(
      screen.getByText('Прямой экспорт каталога в Prom.ua'),
    ).toBeInTheDocument();
  });

  it('открывает модальное окно импорта при клике на Импорт из Prom.ua', () => {
    renderComponent();

    const importBtn = screen.getByRole('button', { name: /Импорт из Prom.ua/i });
    fireEvent.click(importBtn);

    expect(
      screen.getByText('Импорт каталога из Prom.ua'),
    ).toBeInTheDocument();
  });

  it('сохраняет настройки тенанта включая переключатель режима накладных', async () => {
    vi.mocked(tenantsApi.update).mockResolvedValue({ data: { success: true } } as any);

    renderComponent();

    const saveBtn = screen.getByRole('button', { name: /Сохранить/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(tenantsApi.update).toHaveBeenCalledWith(
        'columb',
        expect.objectContaining({
          promShopTitle: 'Columb Official Prom',
          promExportEnabled: true,
          promSyncIntervalMinutes: 15,
          promOrderWebhookEnabled: true,
          promCreateOrderDocumentEnabled: false,
        }),
      );
    });
  });
});
