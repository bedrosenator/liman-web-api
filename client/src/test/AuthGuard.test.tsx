import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// ─── Test utilities ───────────────────────────────────────────────────────────

function TestPageSecure() {
  return <div data-testid="secure-page">Защищённая страница</div>;
}

function TestPageLogin() {
  return <div data-testid="login-page">Страница входа</div>;
}

function TestPageUnauthorized() {
  return <div data-testid="unauthorized-page">Недостаточно прав</div>;
}

function renderWithRouter(
  initialPath: string,
  sessionValues: Record<string, string> = {},
) {
  // Настраиваем sessionStorage
  Object.entries(sessionValues).forEach(([k, v]) => sessionStorage.setItem(k, v));

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<TestPageLogin />} />
          <Route
            path="/superadmin"
            element={
              <ProtectedRoute requireSuperAdmin>
                <TestPageSecure />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/:tenantId"
            element={
              <ProtectedRoute>
                <TestPageSecure />
              </ProtectedRoute>
            }
          />
          <Route path="/unauthorized" element={<TestPageUnauthorized />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('должен перенаправить на /login если нет API ключа', () => {
    renderWithRouter('/superadmin');
    expect(screen.getByTestId('login-page')).toBeDefined();
    expect(screen.queryByTestId('secure-page')).toBeNull();
  });

  it('должен разрешить доступ суперадмину с корректными данными', () => {
    renderWithRouter('/superadmin', {
      liman_api_key: 'master-key',
      liman_role: 'superadmin',
    });
    expect(screen.getByTestId('secure-page')).toBeDefined();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('должен перенаправить тенанта на /login при запросе superadmin-маршрута', () => {
    renderWithRouter('/superadmin', {
      liman_api_key: 'tenant-key',
      liman_role: 'tenant',
    });
    // Недостаточно прав → редирект на /login
    expect(screen.getByTestId('login-page')).toBeDefined();
    expect(screen.queryByTestId('secure-page')).toBeNull();
  });

  it('должен разрешить доступ к portal если есть api key', () => {
    renderWithRouter('/portal/columb', {
      liman_api_key: 'tenant-key',
      liman_role: 'tenant',
      liman_tenant_id: 'columb',
    });
    expect(screen.getByTestId('secure-page')).toBeDefined();
  });

  it('должен разрешить суперадмину доступ к portal', () => {
    renderWithRouter('/portal/columb', {
      liman_api_key: 'master-key',
      liman_role: 'superadmin',
    });
    expect(screen.getByTestId('secure-page')).toBeDefined();
  });

  it('должен блокировать доступ без api key даже к portal маршруту', () => {
    renderWithRouter('/portal/columb');
    expect(screen.getByTestId('login-page')).toBeDefined();
    expect(screen.queryByTestId('secure-page')).toBeNull();
  });
});

// ─── AuthContext ──────────────────────────────────────────────────────────────

describe('AuthContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('должен начать с неаутентифицированного состояния', () => {
    const results: { isAuthenticated: boolean }[] = [];

    function Probe() {
      const auth = useAuth();
      results.push({ isAuthenticated: auth.isAuthenticated });
      return null;
    }

    render(
      <AuthProvider>
        <MemoryRouter>
          <Probe />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(results[0].isAuthenticated).toBe(false);
  });

  it('должен считаться аутентифицированным если есть ключ в sessionStorage', () => {
    sessionStorage.setItem('liman_api_key', 'test-key');
    sessionStorage.setItem('liman_role', 'superadmin');

    const results: { isAuthenticated: boolean; role: string | null }[] = [];

    function Probe() {
      const auth = useAuth();
      results.push({ isAuthenticated: auth.isAuthenticated, role: auth.role });
      return null;
    }

    render(
      <AuthProvider>
        <MemoryRouter>
          <Probe />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(results[0].isAuthenticated).toBe(true);
    expect(results[0].role).toBe('superadmin');
  });

  it('useAuth должен выбрасывать ошибку вне AuthProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(
        <MemoryRouter>
          <ProtectedRoute>
            <div />
          </ProtectedRoute>
        </MemoryRouter>,
      );
    }).toThrow();

    consoleSpy.mockRestore();
  });
});
