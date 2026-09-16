import { useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useLanguage } from '@/context/LanguageContext';
import { Store, Database, Link2 } from 'lucide-react';

/**
 * Страница Личного кабинета клиента (заглушка для TASK-20/21/22/23).
 * Будет содержать: Horoshop Health Widget, XML фид, ручная синхронизация,
 * Резервные копии, Prom/Rozetka/WooCommerce вкладки.
 */
export function ClientPortalPage() {
  const { t } = useLanguage();
  const { tenantId } = useParams<{ tenantId: string }>();

  return (
    <Layout>
      <div className="page" id="client-portal-page">
        <div className="page-header">
          <h1 className="page-title">
            <Store size={24} />
            {t('clientPortal')}
          </h1>
          <p className="page-subtitle">
            Магазин: <strong>{tenantId}</strong>
          </p>
        </div>

        {/* Health Widget заглушка */}
        <div className="health-grid" id="health-grid">
          <div className="health-card" id="health-mariadb">
            <div className="health-card__icon">
              <Database size={20} />
            </div>
            <div className="health-card__info">
              <div className="health-card__label">MariaDB Limansoft</div>
              <div className="health-card__status">
                <span className="status-dot status-dot--grey" />
                <span>{t('statusPending')}</span>
              </div>
            </div>
          </div>
          <div className="health-card" id="health-horoshop">
            <div className="health-card__icon">
              <Link2 size={20} />
            </div>
            <div className="health-card__info">
              <div className="health-card__label">{t('horoshop')}</div>
              <div className="health-card__status">
                <span className="status-dot status-dot--grey" />
                <span>{t('statusPending')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Заглушка — реализуется в TASK-20/21/22 */}
        <div className="card">
          <div className="card__body placeholder-section">
            <Store size={48} className="placeholder-section__icon" />
            <h2 className="placeholder-section__title">{t('horoshop')} Portal</h2>
            <p className="placeholder-section__desc">
              Личный кабинет клиента будет реализован в TASK-20, 21, 22, 23
            </p>
            <div className="badges-row">
              <div className="badge badge--indigo">TASK-20</div>
              <div className="badge badge--indigo">TASK-21</div>
              <div className="badge badge--amber">TASK-22</div>
              <div className="badge badge--emerald">TASK-23</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
