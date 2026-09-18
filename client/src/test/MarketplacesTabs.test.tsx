import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ClientPortalPage } from '@/pages/ClientPortalPage';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import {
  tenantsApi,
  horoshopApi,
  promApi,
  rozetkaApi,
  woocommerceApi,
} from '@/api/client';

vi.mock('@/api/client', () => ({
  tenantsApi: {
    get: vi.fn(),
    ping: vi.fn(),
    update: vi.fn(),
  },
  horoshopApi: {
    ping: vi.fn(),
    syncPricesStocks: vi.fn(),
    syncPricesStocksAsync: vi.fn(),
    getActivity: vi.fn(),
    saveSettings: vi.fn(),
    importCatalog: vi.fn(),
    getExportCategories: vi.fn().mockResolvedValue({
      data: { success: true, categories: [] },
    }),
  },
  promApi: {
    ping: vi.fn(),
    syncStock: vi.fn(),
  },
  rozetkaApi: {
    ping: vi.fn(),
    syncPricesStocks: vi.fn(),
  },
  woocommerceApi: {
    ping: vi.fn(),
    syncStock: vi.fn(),
    syncProducts: vi.fn(),
    importCatalog: vi.fn(),
    getPluginDownloadUrl: vi.fn(
      (tenantId: string) => `/api/v1/woocommerce/${tenantId}/plugin/download`,
    ),
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
  // Prom: Not connected initially
  promApiKey: '',
  promExportEnabled: false,
  // Rozetka: Connected
  rozetkaClientId: '12345',
  rozetkaClientSecret: '••••••••',
  rozetkaExportEnabled: true,
  // WooCommerce: Connected
  woocommerceUrl: 'https://my-woo-store.com',
  woocommerceConsumerKey: 'ck_test123',
  woocommerceConsumerSecret: '••••••••',
  woocommerceSyncEnabled: true,
};

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

describe('MarketplacesTabs (TASK-21: Prom, Rozetka, WooCommerce in Client Portal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tenantsApi.get).mockResolvedValue({ data: mockTenant } as any);
    vi.mocked(tenantsApi.ping).mockResolvedValue({ data: { success: true } } as any);
    vi.mocked(horoshopApi.ping).mockResolvedValue({ data: { success: true } } as any);
    vi.mocked(horoshopApi.getActivity).mockResolvedValue({ data: [] } as any);
    vi.mocked(promApi.ping).mockResolvedValue({ data: { success: true } } as any);
    vi.mocked(rozetkaApi.ping).mockResolvedValue({ data: { success: true } } as any);
    vi.mocked(woocommerceApi.ping).mockResolvedValue({ data: { success: true } } as any);
  });

  it('отображает витрину интеграций и бейджи Подключено / Доступно для подключения', async () => {
    renderPortal();

    await waitFor(() => {
      expect(document.getElementById('platform-tabs')).toBeInTheDocument();
    });

    const promTab = document.getElementById('tab-prom');
    const rozetkaTab = document.getElementById('tab-rozetka');
    const wooTab = document.getElementById('tab-woocommerce');

    expect(promTab).toBeInTheDocument();
    expect(rozetkaTab).toBeInTheDocument();
    expect(wooTab).toBeInTheDocument();

    // Prom не подключен (нет ключа) -> бейдж "Доступно для подключения"
    expect(promTab).toHaveTextContent(/Доступно для подключения/i);

    // Rozetka и WooCommerce подключены -> бейдж "Подключено"
    expect(rozetkaTab).toHaveTextContent(/Подключено/i);
    expect(wooTab).toHaveTextContent(/Подключено/i);
  });

  it('переключается на вкладку Prom.ua и отображает YML фид и кнопку синхронизации', async () => {
    renderPortal();

    await waitFor(() => {
      expect(document.getElementById('tab-prom')).toBeInTheDocument();
    });

    fireEvent.click(document.getElementById('tab-prom')!);

    await waitFor(() => {
      expect(document.getElementById('prom-tab-content')).toBeInTheDocument();
      expect(document.getElementById('prom-feed-card')).toBeInTheDocument();
      expect(document.getElementById('prom-feed-url')).toHaveTextContent(
        '/api/v1/prom/columb/feed.xml',
      );
    });

    // Кликаем кнопку синхронизации остатков Prom
    vi.mocked(promApi.syncStock).mockResolvedValueOnce({ data: { success: true } } as any);
    const syncBtn = screen.getByRole('button', { name: /Синхронизировать остатки в Prom/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(promApi.syncStock).toHaveBeenCalledWith('columb');
      expect(screen.getByText(/поставлена в очередь BullMQ/i)).toBeInTheDocument();
    });
  });

  it('переключается на вкладку Rozetka и отображает XML фид и форму настроек', async () => {
    renderPortal();

    await waitFor(() => {
      expect(document.getElementById('tab-rozetka')).toBeInTheDocument();
    });

    fireEvent.click(document.getElementById('tab-rozetka')!);

    await waitFor(() => {
      expect(document.getElementById('rozetka-tab-content')).toBeInTheDocument();
      expect(document.getElementById('rozetka-feed-url')).toHaveTextContent(
        '/api/v1/rozetka/columb/feed.xml',
      );
      expect(screen.getByDisplayValue('12345')).toBeInTheDocument();
    });

    // Кликаем "Обновить остатки и цены в Rozetka"
    vi.mocked(rozetkaApi.syncPricesStocks).mockResolvedValueOnce({
      data: { success: true, updatedCount: 42 },
    } as any);

    const rozetkaSyncBtn = screen.getByRole('button', {
      name: /Обновить остатки и цены в Rozetka/i,
    });
    fireEvent.click(rozetkaSyncBtn);

    await waitFor(() => {
      expect(rozetkaApi.syncPricesStocks).toHaveBeenCalledWith('columb');
      expect(screen.getByText(/Синхронизация Rozetka успешно выполнена/i)).toBeInTheDocument();
    });
  });

  it('переключается на вкладку WooCommerce и отображает кнопку скачивания плагина и Actions', async () => {
    renderPortal();

    await waitFor(() => {
      expect(document.getElementById('tab-woocommerce')).toBeInTheDocument();
    });

    fireEvent.click(document.getElementById('tab-woocommerce')!);

    await waitFor(() => {
      expect(document.getElementById('woocommerce-tab-content')).toBeInTheDocument();
      const downloadBtn = document.getElementById('download-woo-plugin-btn');
      expect(downloadBtn).toBeInTheDocument();
      expect(downloadBtn).toHaveAttribute(
        'href',
        '/api/v1/woocommerce/columb/plugin/download',
      );
    });

    // Проверяем наличие кнопок действий WooCommerce
    expect(
      screen.getByRole('button', { name: /Push каталога/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Цены и остатки/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Импорт с сайта/i }),
    ).toBeInTheDocument();
  });
});
