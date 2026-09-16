import { type ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Store, Database, Settings, LogOut, Zap } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ThemeToggle } from '@/components/ThemeToggle';

interface LayoutProps {
  children: ReactNode;
}

/**
 * Главный Layout в Enterprise-стиле.
 * Содержит: шапку с лого, переключатель темы и языка, боковую навигацию и основной контент.
 */
export function Layout({ children }: LayoutProps) {
  const { t } = useLanguage();
  const { role, tenantId, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isSuperAdmin = role === 'superadmin';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = isSuperAdmin
    ? [
        { to: '/superadmin', icon: LayoutDashboard, label: t('allTenants'), id: 'nav-tenants' },
        { to: '/superadmin/queues', icon: Zap, label: t('queues'), id: 'nav-queues' },
        { to: '/superadmin/settings', icon: Settings, label: t('settings'), id: 'nav-settings' },
      ]
    : tenantId
    ? [
        { to: `/portal/${tenantId}`, icon: Store, label: 'Хорошоп', id: 'nav-horoshop' },
        { to: `/portal/${tenantId}/backups`, icon: Database, label: t('backups'), id: 'nav-backups' },
        { to: `/portal/${tenantId}/settings`, icon: Settings, label: t('settings'), id: 'nav-settings' },
      ]
    : [];

  return (
    <div className="layout">
      {/* Шапка */}
      <header className="layout-header" id="app-header">
        <div className="layout-header__brand">
          <div className="layout-header__logo">
            <span className="layout-header__logo-icon">⚡</span>
            <span className="layout-header__logo-text">{t('appName')}</span>
          </div>
          {isSuperAdmin && (
            <span className="badge badge--indigo">Super Admin</span>
          )}
        </div>

        <div className="layout-header__actions">
          <ThemeToggle />
          <LanguageSelector />

          <div className="layout-header__status" id="api-status">
            <span className="status-dot status-dot--green" />
            <span className="layout-header__status-text">API</span>
          </div>

          <button
            id="logout-btn"
            className="btn btn--ghost btn--sm"
            onClick={handleLogout}
            aria-label={t('logout')}
            title={t('logout')}
            data-tooltip={t('logout')}
            data-tooltip-pos="bottom"
          >
            <LogOut size={16} />
            <span>{t('logout')}</span>
          </button>
        </div>
      </header>

      <div className="layout-body">
        {/* Боковая навигация */}
        <nav className="layout-sidebar" id="sidebar-nav" aria-label="Main navigation">
          <ul className="sidebar-nav">
            {navItems.map((item) => {
              const isRootSuperAdmin = item.to === '/superadmin';
              const isRootPortal = tenantId && item.to === `/portal/${tenantId}`;
              
              const isActive = isRootSuperAdmin
                ? location.pathname === '/superadmin' || location.pathname === '/superadmin/'
                : isRootPortal
                ? location.pathname === `/portal/${tenantId}` || location.pathname === `/portal/${tenantId}/`
                : location.pathname.startsWith(item.to);

              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    id={item.id}
                    className={`sidebar-nav__item ${isActive ? 'sidebar-nav__item--active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Основной контент */}
        <main className="layout-main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
