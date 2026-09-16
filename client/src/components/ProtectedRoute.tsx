import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
  requiredTenantId?: string;
}

/**
 * Защита маршрутов:
 * - Если не авторизован — редирект на /login
 * - Если требуется superadmin роль, но текущая роль иная — редирект на /login
 * - Если требуется конкретный tenantId, но он не совпадает — редирект на /login
 */
export function ProtectedRoute({
  children,
  requireSuperAdmin = false,
  requiredTenantId,
}: ProtectedRouteProps) {
  const { isAuthenticated, role, tenantId } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && role !== 'superadmin') {
    return <Navigate to="/login?reason=insufficient_permissions" replace />;
  }

  if (
    requiredTenantId &&
    role !== 'superadmin' &&
    tenantId !== requiredTenantId
  ) {
    return <Navigate to="/login?reason=access_denied" replace />;
  }

  return <>{children}</>;
}
