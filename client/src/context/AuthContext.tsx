import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

const AUTH_KEY = 'liman_api_key';
const AUTH_ROLE_KEY = 'liman_role';

export type AuthRole = 'superadmin' | 'tenant';

interface AuthContextValue {
  apiKey: string | null;
  role: AuthRole | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  login: (key: string, role: AuthRole, tenantId?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Разбирает magic-link параметр ?token= из URL,
 * сохраняет токен в sessionStorage и очищает параметр из строки.
 */
function extractTokenFromUrl(): { key: string; tenantId?: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const tid = params.get('tid');
  if (!token) return null;

  // Очищаем чувствительный параметр из адресной строки
  params.delete('token');
  params.delete('tid');
  const newUrl =
    window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  window.history.replaceState({}, '', newUrl);

  return { key: token, tenantId: tid ?? undefined };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    // Сначала проверяем magic link
    const magic = extractTokenFromUrl();
    if (magic) {
      sessionStorage.setItem(AUTH_KEY, magic.key);
      if (magic.tenantId) sessionStorage.setItem('liman_tenant_id', magic.tenantId);
      return magic.key;
    }
    return sessionStorage.getItem(AUTH_KEY) ?? localStorage.getItem(AUTH_KEY);
  });

  const [role, setRole] = useState<AuthRole | null>(
    () => (sessionStorage.getItem(AUTH_ROLE_KEY) as AuthRole | null) ?? null,
  );

  const [tenantId, setTenantId] = useState<string | null>(
    () => sessionStorage.getItem('liman_tenant_id'),
  );

  const login = useCallback((key: string, authRole: AuthRole, tid?: string) => {
    setApiKey(key);
    setRole(authRole);
    setTenantId(tid ?? null);
    sessionStorage.setItem(AUTH_KEY, key);
    sessionStorage.setItem(AUTH_ROLE_KEY, authRole);
    if (tid) sessionStorage.setItem('liman_tenant_id', tid);
  }, []);

  const logout = useCallback(() => {
    setApiKey(null);
    setRole(null);
    setTenantId(null);
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_ROLE_KEY);
    sessionStorage.removeItem('liman_tenant_id');
    localStorage.removeItem(AUTH_KEY);
  }, []);

  const value = useMemo(
    () => ({
      apiKey,
      role,
      tenantId,
      isAuthenticated: Boolean(apiKey),
      login,
      logout,
    }),
    [apiKey, role, tenantId, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
