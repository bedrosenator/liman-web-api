import { Layout } from '@/components/Layout';
import { useLanguage } from '@/context/LanguageContext';
import { LayoutDashboard, Users, Zap, Server } from 'lucide-react';

/**
 * Страница Супер-Админа (заглушка для TASK-19).
 * Будет содержать All-Tenants Master Grid, мониторинг очередей BullMQ
 * и управление тенантами.
 */
export function SuperAdminPage() {
  const { t } = useLanguage();

  return (
    <Layout>
      <div className="page" id="superadmin-page">
        <div className="page-header">
          <h1 className="page-title">
            <LayoutDashboard size={24} />
            {t('allTenants')}
          </h1>
          <p className="page-subtitle">
            {t('superAdmin')} — управление всеми клиентами в одном окне
          </p>
        </div>

        {/* Сводные метрики */}
        <div className="stats-grid" id="admin-stats">
          <div className="stat-card" id="stat-tenants">
            <div className="stat-card__icon stat-card__icon--indigo">
              <Users size={20} />
            </div>
            <div className="stat-card__value">—</div>
            <div className="stat-card__label">{t('tenants')}</div>
          </div>
          <div className="stat-card" id="stat-queues">
            <div className="stat-card__icon stat-card__icon--emerald">
              <Zap size={20} />
            </div>
            <div className="stat-card__value">—</div>
            <div className="stat-card__label">{t('queues')}</div>
          </div>
          <div className="stat-card" id="stat-api">
            <div className="stat-card__icon stat-card__icon--amber">
              <Server size={20} />
            </div>
            <div className="stat-card__value">OK</div>
            <div className="stat-card__label">API</div>
          </div>
        </div>

        {/* Заглушка — реализуется в TASK-19 */}
        <div className="card">
          <div className="card__body placeholder-section">
            <LayoutDashboard size={48} className="placeholder-section__icon" />
            <h2 className="placeholder-section__title">All-Tenants Master Grid</h2>
            <p className="placeholder-section__desc">
              Единая матрица настроек всех клиентов будет реализована в TASK-19
            </p>
            <div className="badge badge--indigo">TASK-19 — Backlog</div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
