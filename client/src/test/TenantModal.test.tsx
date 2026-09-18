import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TenantModal, type TenantData } from '@/components/admin/TenantModal';
import { LanguageProvider } from '@/context/LanguageContext';
import { tenantsApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  tenantsApi: {
    revealCredentials: vi.fn(),
    ping: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const mockTenant: TenantData = {
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
  horoshopLogin: 'admin',
  horoshopPassword: '••••••••',
  horoshopExportEnabled: true,
  promApiKey: '••••••••',
  rozetkaClientId: '123',
  rozetkaClientSecret: '••••••••',
  woocommerceUrl: 'http://localhost:8080',
  woocommerceConsumerKey: 'ck_123',
  woocommerceConsumerSecret: '••••••••',
};

function renderModal(props = {}) {
  return render(
    <LanguageProvider>
      <TenantModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        tenant={mockTenant}
        {...props}
      />
    </LanguageProvider>,
  );
}

describe('TenantModal Password Visibility & Unmasking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tenantsApi.revealCredentials).mockResolvedValue({
      data: {
        id: 'columb',
        dbPassword: 'rootpassword',
        horoshopPassword: 'horoshop_secret',
        promApiKey: 'prom_secret_key',
        rozetkaClientSecret: 'rozetka_secret_val',
        woocommerceConsumerSecret: 'woo_secret_val',
        apiKey: 'api_key_123',
      },
    } as any);
  });

  it('раскрывает реальный пароль MariaDB при клике на иконку глаза', async () => {
    renderModal();

    // Переключаемся на таб database
    const dbTab = screen.getByText('MariaDB Limansoft');
    fireEvent.click(dbTab);

    // Находим поле пароля БД
    const passwordInput = screen.getByPlaceholderText(/оставьте пустым/i) as HTMLInputElement;
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput.type).toBe('password');
    expect(passwordInput.value).toBe('••••••••');

    // Кликаем на кнопку с глазиком "Показать пароль"
    const toggleBtn = screen.getByTitle('Показать пароль');
    fireEvent.click(toggleBtn);

    // Должен вызваться revealCredentials
    await waitFor(() => {
      expect(tenantsApi.revealCredentials).toHaveBeenCalledWith('columb');
      expect(passwordInput.type).toBe('text');
      expect(passwordInput.value).toBe('rootpassword');
    });

    // При повторном клике скрывает пароль обратно
    const hideBtn = screen.getByTitle('Скрыть пароль');
    fireEvent.click(hideBtn);
    expect(passwordInput.type).toBe('password');
  });

  it('раскрывает реальный пароль Хорошоп при клике на глазик во вкладке Хорошоп', async () => {
    renderModal();

    const horoshopTab = screen.getByText('Хорошоп');
    fireEvent.click(horoshopTab);

    const toggleBtn = screen.getByTitle('Показать пароль');
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(tenantsApi.revealCredentials).toHaveBeenCalledWith('columb');
      const horoshopInput = screen.getByDisplayValue('horoshop_secret') as HTMLInputElement;
      expect(horoshopInput.type).toBe('text');
      expect(horoshopInput.value).toBe('horoshop_secret');
    });
  });

  it('отображает тумблер режима создания накладной Лимана с бейджем Экспериментально', () => {
    renderModal();

    const horoshopTab = screen.getByText('Хорошоп');
    fireEvent.click(horoshopTab);

    const docCheckbox = screen.getByRole('checkbox', {
      name: /Создавать черновик накладной/i,
    }) as HTMLInputElement;
    expect(docCheckbox).toBeInTheDocument();
    expect(docCheckbox.checked).toBe(false);

    // Кликаем по чекбоксу
    fireEvent.click(docCheckbox);
    expect(docCheckbox.checked).toBe(true);

    // Проверяем наличие бейджа "Экспериментально"
    expect(screen.getByText('Экспериментально')).toBeInTheDocument();
  });
});
