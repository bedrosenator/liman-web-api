import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SuperAdminPage } from '@/pages/SuperAdminPage';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { tenantsApi, adminApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  tenantsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ping: vi.fn(),
    revealCredentials: vi.fn(),
    rotateKey: vi.fn(),
  },
  adminApi: {
    getOverview: vi.fn(),
    getQueues: vi.fn(),
    retryFailedQueues: vi.fn(),
  },
}));

const mockTenants = [
  {
    id: 'columb',
    name: 'Columb Shop',
    isActive: true,
    dbHost: '127.0.0.1',
    dbPort: 3306,
    dbName: 'columbDB',
    dbUser: 'root',
    dbPassword: '••••••••',
    priceColumn: 'cena2',
    stockColumn: 'skl_k',
    syncIntervalMinutes: 15,
    horoshopDomain: 'shop.horoshop.ua',
    horoshopExportEnabled: true,
    apiKey: '••••••••',
  },
];

const mockOverview = {
  tenantsCount: 1,
  activeTenantsCount: 1,
  redisStatus: 'healthy',
  queueStatus: 'normal',
  totalWaiting: 0,
  totalActive: 0,
  totalFailed: 0,
};

const mockQueues = {
  queues: [
    {
      name: 'sync-stock',
      label: 'Синхронизация остатков и цен',
      isPaused: false,
      counts: { waiting: 0, active: 0, completed: 5, failed: 0, delayed: 0 },
    },
  ],
};

function renderSuperAdmin() {
  return render(
    <AuthProvider>
      <LanguageProvider>
        <MemoryRouter>
          <SuperAdminPage />
        </MemoryRouter>
      </LanguageProvider>
    </AuthProvider>,
  );
}

describe('SuperAdminPage (TASK-19)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('liman_lang', 'ru');
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(tenantsApi.list).mockResolvedValue({ data: mockTenants } as any);
    vi.mocked(adminApi.getOverview).mockResolvedValue({ data: mockOverview } as any);
    vi.mocked(adminApi.getQueues).mockResolvedValue({ data: mockQueues } as any);
  });

  it('рендерит All-Tenants Master Grid со списком магазинов и метриками', async () => {
    renderSuperAdmin();

    await waitFor(() => {
      expect(screen.getByText('Columb Shop')).toBeInTheDocument();
      expect(screen.getByText('columb')).toBeInTheDocument();
      expect(screen.getByText('shop.horoshop.ua')).toBeInTheDocument();
    });

    expect(screen.getByText('All-Tenants Master Grid')).toBeInTheDocument();
  });

  it('показывает сводные карточки метрик SaaS Overview', async () => {
    renderSuperAdmin();

    await waitFor(() => {
      expect(screen.getByText('1 / 1')).toBeInTheDocument();
      expect(screen.getByText(/0 акт\. \/ 0 сбоев/)).toBeInTheDocument();
    });
  });

  it('вызывает пинг MariaDB при клике на кнопку Ping', async () => {
    vi.mocked(tenantsApi.ping).mockResolvedValue({
      data: { success: true, pingMs: 14, message: 'OK' },
    } as any);

    renderSuperAdmin();

    await waitFor(() => {
      expect(screen.getByText('Columb Shop')).toBeInTheDocument();
    });

    const pingBtn = screen.getByTitle('Тест соединения');
    fireEvent.click(pingBtn);

    await waitFor(() => {
      expect(tenantsApi.ping).toHaveBeenCalledWith('columb');
      expect(screen.getByText('14ms')).toBeInTheDocument();
    });
  });

  it('вызывает revealCredentials при клике на иконку 👁 (Показать секреты)', async () => {
    vi.mocked(tenantsApi.revealCredentials).mockResolvedValue({
      data: {
        id: 'columb',
        dbPassword: 'realDatabasePassword',
        apiKey: 'real-unmasked-api-key',
      },
    } as any);

    renderSuperAdmin();

    await waitFor(() => {
      expect(screen.getByText('Columb Shop')).toBeInTheDocument();
    });

    const revealBtn = screen.getByTitle('Показать пароль');
    fireEvent.click(revealBtn);

    await waitFor(() => {
      expect(tenantsApi.revealCredentials).toHaveBeenCalledWith('columb');
      expect(screen.getByDisplayValue('realDatabasePassword')).toBeInTheDocument();
      expect(screen.getByDisplayValue('real-unmasked-api-key')).toBeInTheDocument();
    });
  });
});
