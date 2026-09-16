import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { SuperAdminPage } from '@/pages/SuperAdminPage';
import { ClientPortalPage } from '@/pages/ClientPortalPage';

/**
 * Корневой компонент приложения.
 * Маршрутизация:
 *   /login              — экран авторизации
 *   /superadmin/*       — панель супер-администратора (требует роль superadmin)
 *   /portal/:tenantId/* — личный кабинет клиента (требует авторизацию)
 *   /                   — редирект на /login
 */
export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Super Admin */}
            <Route
              path="/superadmin"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <SuperAdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/*"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <SuperAdminPage />
                </ProtectedRoute>
              }
            />

            {/* Client Portal */}
            <Route
              path="/portal/:tenantId"
              element={
                <ProtectedRoute>
                  <ClientPortalPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/:tenantId/*"
              element={
                <ProtectedRoute>
                  <ClientPortalPage />
                </ProtectedRoute>
              }
            />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
