import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { LoginPage } from '@/pages/LoginPage';
import { authApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  authApi: {
    login: vi.fn(),
    getMe: vi.fn(),
  },
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

function renderLoginPage(initialRoute = '/login') {
  return render(
    <LanguageProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/superadmin"
              element={<div data-testid="superadmin-route">SuperAdmin Route</div>}
            />
            <Route
              path="/portal/:tenantId"
              element={<div data-testid="portal-route">Portal Route</div>}
            />
            <Route path="/" element={<div data-testid="root-route">Root Route</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </LanguageProvider>,
  );
}

describe('LoginPage (TASK-44: Unified Login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('рендерит единую форму входа с одним полем ввода без лишних вкладок выбора роли', () => {
    renderLoginPage();

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /войти/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();

    // Не должно быть табов переключения ролей
    expect(screen.queryByRole('group', { name: /login mode/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
  });

  it('переключает видимость пароля при клике на иконку глаза', () => {
    renderLoginPage();

    const input = document.getElementById('login-page')?.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /show password/i });
    fireEvent.click(toggleBtn);

    expect(input.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(input.type).toBe('password');
  });

  it('успешно перенаправляет суперадмина на /superadmin при правильном ключе', async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce({
      role: 'superadmin',
    });

    renderLoginPage();

    const input = document.getElementById('login-page')?.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'master-secret-key' } });

    const submitBtn = screen.getByRole('button', { name: /войти/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('master-secret-key');
      expect(screen.getByTestId('superadmin-route')).toBeInTheDocument();
    });

    expect(sessionStorage.getItem('liman_role')).toBe('superadmin');
    expect(sessionStorage.getItem('liman_api_key')).toBe('master-secret-key');
  });

  it('успешно перенаправляет клиента на /portal/:tenantId при ключе магазина', async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce({
      role: 'tenant',
      tenantId: 'columb',
      tenantName: 'Колумб Маркет',
    });

    renderLoginPage();

    const input = document.getElementById('login-page')?.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'columb-tenant-api-key' } });

    const submitBtn = screen.getByRole('button', { name: /войти/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('columb-tenant-api-key');
      expect(screen.getByTestId('portal-route')).toBeInTheDocument();
    });

    expect(sessionStorage.getItem('liman_role')).toBe('tenant');
    expect(sessionStorage.getItem('liman_tenant_id')).toBe('columb');
    expect(sessionStorage.getItem('liman_api_key')).toBe('columb-tenant-api-key');
  });

  it('отображает ошибку валидации при неверном пароле или ключе', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: {
        data: {
          message: 'Неверный пароль или ключ доступа',
        },
      },
    });

    renderLoginPage();

    const input = document.getElementById('login-page')?.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrong-key' } });

    const submitBtn = screen.getByRole('button', { name: /войти/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Неверный пароль или ключ доступа')).toBeInTheDocument();
    });

    // При изменении поля ошибка сбрасывается
    fireEvent.change(input, { target: { value: 'wrong-key-2' } });
    expect(screen.queryByText('Неверный пароль или ключ доступа')).not.toBeInTheDocument();
  });

  it('автоматически аутентифицирует и перенаправляет при наличии токена в session/URL', async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce({
      role: 'superadmin',
    });

    // Моделируем перехват токена
    sessionStorage.setItem('liman_api_key', 'magic-superadmin-token');

    renderLoginPage('/login');

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('magic-superadmin-token');
      expect(screen.getByTestId('superadmin-route')).toBeInTheDocument();
    });
  });
});
