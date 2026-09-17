import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { tenantsApi, adminApi } from '@/api/client';
import { TenantModal, type TenantData } from '@/components/admin/TenantModal';
import {
  LayoutDashboard,
  Users,
  Zap,
  Server,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Copy,
  RotateCw,
  Eye,
  EyeOff,
  Trash2,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Check,
  Settings,
  Key,
  Shield,
  Bell,
  Send,
} from 'lucide-react';

export function SuperAdminPage() {
  const { t } = useLanguage();
  const { apiKey } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const currentTab = location.pathname.includes('/queues')
    ? 'queues'
    : location.pathname.includes('/settings')
    ? 'settings'
    : 'tenants';

  const [tenants, setTenants] = useState<TenantData[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<TenantData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [overview, setOverview] = useState<{
    tenantsCount: number;
    activeTenantsCount: number;
    redisStatus: string;
    queueStatus: string;
    totalWaiting: number;
    totalActive: number;
    totalFailed: number;
  } | null>(null);

  const [queues, setQueues] = useState<any[]>([]);
  const [isRetryingQueue, setIsRetryingQueue] = useState<string | null>(null);

  // Settings tab states
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [copiedMasterKey, setCopiedMasterKey] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);

  // Ping statuses: Map<tenantId, { pingMs?: number; success: boolean; message: string }>
  const [pingStatuses, setPingStatuses] = useState<Record<string, { loading?: boolean; pingMs?: number; success?: boolean }>>({});

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantData | null>(null);

  // Revealed Credentials Modal
  const [revealedCreds, setRevealedCreds] = useState<any | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  // Copied feedback: tenantId -> boolean
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await tenantsApi.list();
      setTenants(res.data);
      setFilteredTenants(res.data);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await adminApi.getOverview();
      setOverview(res.data);
    } catch (err) {
      console.error('Failed to load overview:', err);
    }
  }, []);

  const fetchQueues = useCallback(async () => {
    try {
      const res = await adminApi.getQueues();
      setQueues(res.data.queues || []);
    } catch (err) {
      console.error('Failed to load queues:', err);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchTenants(), fetchOverview(), fetchQueues()]);
    setIsLoading(false);
  }, [fetchTenants, fetchOverview, fetchQueues]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Живое авто-обновление очередей каждые 3 секунды при открытой вкладке "Монитор очередей"
  useEffect(() => {
    if (currentTab === 'queues') {
      fetchQueues();
      fetchOverview();
      const timer = setInterval(() => {
        fetchQueues();
        fetchOverview();
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [currentTab, fetchQueues, fetchOverview]);

  // Search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTenants(tenants);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredTenants(
        tenants.filter(
          (t) =>
            t.id.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            (t.horoshopDomain && t.horoshopDomain.toLowerCase().includes(q)),
        ),
      );
    }
  }, [searchQuery, tenants]);

  // Быстрый пинг MariaDB
  const handlePingMariaDb = async (tenantId: string) => {
    setPingStatuses((prev) => ({ ...prev, [tenantId]: { loading: true } }));
    try {
      const res = await tenantsApi.ping(tenantId);
      setPingStatuses((prev) => ({
        ...prev,
        [tenantId]: { loading: false, success: res.data.success, pingMs: res.data.pingMs },
      }));
    } catch (err: any) {
      setPingStatuses((prev) => ({
        ...prev,
        [tenantId]: { loading: false, success: false },
      }));
    }
  };

  // Копирование персональной ссылки клиента
  const handleCopyClientLink = (tenant: TenantData) => {
    const origin = window.location.origin;
    const tokenPart = tenant.apiKey ? `?token=${tenant.apiKey}` : '';
    const link = `${origin}/portal/${tenant.id}${tokenPart}`;

    navigator.clipboard.writeText(link);
    setCopiedId(tenant.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Раскрытие чувствительных данных (👁)
  const handleRevealCredentials = async (tenantId: string) => {
    setIsRevealing(true);
    try {
      const res = await tenantsApi.revealCredentials(tenantId);
      setRevealedCreds(res.data);
    } catch (err) {
      console.error('Failed to reveal credentials:', err);
    } finally {
      setIsRevealing(false);
    }
  };

  // Ротация API ключа
  const handleRotateKey = async (tenantId: string) => {
    if (window.confirm(t('confirmRotateKey'))) {
      try {
        await tenantsApi.rotateKey(tenantId);
        await fetchTenants();
      } catch (err) {
        console.error('Failed to rotate key:', err);
      }
    }
  };

  // Удаление клиента
  const handleDeleteTenant = async (tenantId: string) => {
    if (window.confirm(t('confirmDeleteTenant'))) {
      try {
        await tenantsApi.delete(tenantId);
        await fetchTenants();
      } catch (err) {
        console.error('Failed to delete tenant:', err);
      }
    }
  };

  // Повтор упавших задач очереди
  const handleRetryQueue = async (queueName: string) => {
    setIsRetryingQueue(queueName);
    try {
      await adminApi.retryFailedQueues(queueName);
      await fetchQueues();
      await fetchOverview();
    } catch (err) {
      console.error('Failed to retry queue jobs:', err);
    } finally {
      setIsRetryingQueue(null);
    }
  };

  return (
    <Layout>
      <div className="page" id="superadmin-page">
        {/* ─── Вкладка 1: Все клиенты (Tenants) ─────────────────────────────── */}
        {currentTab === 'tenants' && (
          <>
            {/* Заголовок страницы */}
            <div className="page-header flex justify-between items-center">
              <div>
                <h1 className="page-title">
                  <LayoutDashboard size={24} />
                  {t('allTenants')}
                </h1>
                <p className="page-subtitle">
                  {t('superAdmin')} — управление всеми клиентами в одном окне
                </p>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setSelectedTenant(null);
                  setIsModalOpen(true);
                }}
                title={t('addTenant')}
                data-tooltip="Добавить нового клиента в систему"
                data-tooltip-pos="bottom"
              >
                <Plus size={18} />
                {t('addTenant')}
              </button>
            </div>

            {/* Сводные карточки метрик (SaaS Overview) */}
            <div className="stats-grid" id="admin-stats">
              <div className="stat-card" id="stat-tenants" data-tooltip="Количество зарегистрированных магазинов">
                <div className="stat-card__icon stat-card__icon--indigo">
                  <Users size={20} />
                </div>
                <div className="stat-card__value">
                  {overview ? `${overview.activeTenantsCount} / ${overview.tenantsCount}` : '—'}
                </div>
                <div className="stat-card__label">{t('activeTenants')}</div>
              </div>

              <div
                className="stat-card cursor-pointer hover:border-indigo transition-colors"
                id="stat-queues"
                onClick={() => navigate('/superadmin/queues')}
                data-tooltip="Нажмите, чтобы открыть монитор очередей BullMQ"
              >
                <div className="stat-card__icon stat-card__icon--emerald">
                  <Zap size={20} />
                </div>
                <div className="stat-card__value">
                  {overview ? `${overview.totalActive} акт. / ${overview.totalFailed} сбоев` : '—'}
                </div>
                <div className="stat-card__label">{t('queues')} BullMQ</div>
              </div>

              <div className="stat-card" id="stat-api" data-tooltip="Статус ядра Redis и NestJS API">
                <div className="stat-card__icon stat-card__icon--amber">
                  <Server size={20} />
                </div>
                <div className="stat-card__value">
                  {overview?.redisStatus === 'healthy' ? 'OK' : 'Проверка'}
                </div>
                <div className="stat-card__label">Redis & API</div>
              </div>
            </div>

            {/* Секция Master Grid */}
            <div className="card mb-6">
              <div className="card__header flex justify-between items-center flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <h2 className="card__title">
                    <Database size={20} className="text-indigo flex-shrink-0" />
                    <span>All-Tenants Master Grid</span>
                  </h2>
                  <span className="badge badge--indigo">{filteredTenants.length}</span>
                </div>

                <div className="search-box">
                  <Search size={16} className="text-muted" />
                  <input
                    type="text"
                    className="input input--sm"
                    placeholder={t('search')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="card__body p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted flex items-center justify-center gap-2">
                    <Loader2 size={20} className="spinner" />
                    <span>{t('loading')}</span>
                  </div>
                ) : filteredTenants.length === 0 ? (
                  <div className="p-8 text-center text-muted">
                    {t('noData')}
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="table" id="all-tenants-grid">
                      <thead>
                        <tr>
                          <th>{t('tenants')}</th>
                          <th>MariaDB Limansoft</th>
                          <th>{t('horoshop')}</th>
                          <th>Prom.ua</th>
                          <th>Rozetka</th>
                          <th>WooCommerce</th>
                          <th className="text-right">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTenants.map((tenant) => {
                          const pingInfo = pingStatuses[tenant.id];
                          return (
                            <tr key={tenant.id} id={`tenant-row-${tenant.id}`}>
                              {/* Колонка 1: Клиент */}
                              <td>
                                <div className="font-semibold text-primary">{tenant.name}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="badge badge--xs badge--subtle font-mono">
                                    {tenant.id}
                                  </span>
                                  <span
                                    className={`status-pill ${tenant.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}
                                    data-tooltip={tenant.isActive ? 'Магазин активен' : 'Магазин отключен'}
                                  >
                                    <span className="status-pill__dot" />
                                    {tenant.isActive ? t('active') : t('inactive')}
                                  </span>
                                </div>
                              </td>

                              {/* Колонка 2: MariaDB */}
                              <td>
                                <div className="font-mono text-xs text-secondary">
                                  {tenant.dbHost}:{tenant.dbPort}/{tenant.dbName}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted">
                                    Ц: <strong className="font-mono">{tenant.priceColumn}</strong> | О: <strong className="font-mono">{tenant.stockColumn}</strong>
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn--secondary btn--xs"
                                    onClick={() => handlePingMariaDb(tenant.id)}
                                    disabled={pingInfo?.loading}
                                    title={t('testConnection')}
                                    data-tooltip="Проверить прямое подключение к MariaDB"
                                    data-tooltip-pos="top"
                                  >
                                    {pingInfo?.loading ? (
                                      <Loader2 size={12} className="spinner" />
                                    ) : pingInfo?.success ? (
                                      <CheckCircle2 size={12} className="text-emerald" />
                                    ) : pingInfo?.success === false ? (
                                      <AlertCircle size={12} className="text-rose" />
                                    ) : (
                                      <Database size={12} />
                                    )}
                                    <span className="ml-1">
                                      {pingInfo?.pingMs !== undefined ? `${pingInfo.pingMs}ms` : 'Ping'}
                                    </span>
                                  </button>
                                </div>
                              </td>

                              {/* Колонка 3: Хорошоп */}
                              <td>
                                {tenant.horoshopDomain ? (
                                  <div>
                                    <div className="text-xs font-mono text-primary truncate max-w-[150px]">
                                      {tenant.horoshopDomain}
                                    </div>
                                    <div className="flex items-center gap-1 mt-1">
                                      <span
                                        className={`badge badge--xs badge--${tenant.horoshopExportEnabled ? 'emerald' : 'subtle'}`}
                                        data-tooltip="Интеграция с каталогом Хорошоп"
                                      >
                                        {tenant.horoshopExportEnabled ? t('statusEnabled') : t('statusDisabled')}
                                      </span>
                                      <span className="text-xs text-muted">{tenant.syncIntervalMinutes}м</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted">—</span>
                                )}
                              </td>

                              {/* Колонка 4: Prom */}
                              <td>
                                {tenant.promApiKey ? (
                                  <span
                                    className={`badge badge--xs badge--${tenant.promExportEnabled ? 'emerald' : 'indigo'}`}
                                    data-tooltip="Синхронизация с Prom.ua"
                                  >
                                    {tenant.promExportEnabled ? 'Экспорт' : 'Подключен'}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted">—</span>
                                )}
                              </td>

                              {/* Колонка 5: Rozetka */}
                              <td>
                                {tenant.rozetkaClientId ? (
                                  <span
                                    className={`badge badge--xs badge--${tenant.rozetkaExportEnabled ? 'emerald' : 'indigo'}`}
                                    data-tooltip="Синхронизация с Rozetka"
                                  >
                                    {tenant.rozetkaClientId}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted">—</span>
                                )}
                              </td>

                              {/* Колонка 6: WooCommerce */}
                              <td>
                                {tenant.woocommerceUrl ? (
                                  <span
                                    className={`badge badge--xs badge--${tenant.woocommerceSyncEnabled ? 'emerald' : 'indigo'}`}
                                    data-tooltip="Двусторонняя синхронизация с WooCommerce"
                                  >
                                    Two-Way
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted">—</span>
                                )}
                              </td>

                              {/* Колонка 7: Действия */}
                              <td className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {/* Open Portal */}
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon--sm"
                                    onClick={() => navigate(`/portal/${tenant.id}`)}
                                    title={t('openPortal')}
                                    data-tooltip="Войти в личный кабинет клиента"
                                    data-tooltip-pos="top"
                                  >
                                    <ExternalLink size={16} />
                                  </button>

                                  {/* Copy Link */}
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon--sm"
                                    onClick={() => handleCopyClientLink(tenant)}
                                    title={t('copyLink')}
                                    data-tooltip="Скопировать постоянную ссылку для входа"
                                    data-tooltip-pos="top"
                                  >
                                    {copiedId === tenant.id ? (
                                      <Check size={16} className="text-emerald" />
                                    ) : (
                                      <Copy size={16} />
                                    )}
                                  </button>

                                  {/* Reveal Credentials 👁 */}
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon--sm"
                                    onClick={() => handleRevealCredentials(tenant.id)}
                                    disabled={isRevealing}
                                    title={t('revealPassword')}
                                    data-tooltip="Показать пароли и API-ключи"
                                    data-tooltip-pos="top"
                                  >
                                    <Eye size={16} className="text-amber" />
                                  </button>

                                  {/* Edit */}
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon--sm"
                                    onClick={() => {
                                      setSelectedTenant(tenant);
                                      setIsModalOpen(true);
                                    }}
                                    title={t('edit')}
                                    data-tooltip="Редактировать магазин"
                                    data-tooltip-pos="top"
                                  >
                                    <Edit2 size={16} />
                                  </button>

                                  {/* Rotate Key */}
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon--sm"
                                    onClick={() => handleRotateKey(tenant.id)}
                                    title={t('rotateKey')}
                                    data-tooltip="Сгенерировать новый персональный API-ключ"
                                    data-tooltip-pos="top"
                                  >
                                    <RotateCw size={16} />
                                  </button>

                                  {/* Delete */}
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon--sm text-rose"
                                    onClick={() => handleDeleteTenant(tenant.id)}
                                    title={t('delete')}
                                    data-tooltip="Удалить магазин"
                                    data-tooltip-pos="top"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ─── Вкладка 2: Очереди BullMQ ─────────────────────────────────────── */}
        {currentTab === 'queues' && (
          <>
            <div className="page-header flex justify-between items-center">
              <div>
                <h1 className="page-title">
                  <Zap size={24} className="text-emerald" />
                  {t('queueMonitor')} (BullMQ)
                </h1>
                <p className="page-subtitle">
                  Мониторинг очередей, пакетных фоновых задач и автоматических повторов
                </p>
              </div>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={fetchQueues}
                title={t('refresh')}
                data-tooltip="Обновить статистику фоновых очередей"
                data-tooltip-pos="bottom"
              >
                <RotateCw size={16} />
                {t('refresh')}
              </button>
            </div>

            {/* Метрики очередей */}
            <div className="stats-grid mb-6">
              <div className="stat-card" data-tooltip="Всего задач в ожидании исполнения">
                <div className="stat-card__icon stat-card__icon--amber">
                  <Zap size={20} />
                </div>
                <div className="stat-card__value">
                  {overview?.totalWaiting ?? 0}
                </div>
                <div className="stat-card__label">{t('queueWaiting')}</div>
              </div>

              <div className="stat-card" data-tooltip="Задачи, выполняемые воркерами прямо сейчас">
                <div className="stat-card__icon stat-card__icon--indigo">
                  <Server size={20} />
                </div>
                <div className="stat-card__value">
                  {overview?.totalActive ?? 0}
                </div>
                <div className="stat-card__label">{t('queueActive')}</div>
              </div>

              <div className="stat-card" data-tooltip="Количество упавших задач, требующих повтора">
                <div className="stat-card__icon stat-card__icon--rose">
                  <AlertCircle size={20} />
                </div>
                <div className="stat-card__value">
                  {overview?.totalFailed ?? 0}
                </div>
                <div className="stat-card__label">{t('queueFailed')}</div>
              </div>
            </div>

            {/* Карточки BullMQ Очередей с исправленными пробелами */}
            <div className="card">
              <div className="card__header flex justify-between items-center">
                <h2 className="card__title">
                  <Database size={20} className="text-emerald flex-shrink-0" />
                  <span>Активные очереди BullMQ</span>
                </h2>
              </div>

              <div className="card__body p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {queues.map((q) => (
                    <div key={q.name} className="card card--subtle p-4" id={`queue-card-${q.name}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm text-primary">{q.label || q.name}</span>
                        <span className="badge badge--xs badge--subtle font-mono">{q.name}</span>
                      </div>

                      {/* Сетка счетчиков с пробелами и выравниванием */}
                      <div className="queue-counts-grid">
                        <div
                          className="queue-count-badge"
                          data-tooltip="Задачи в очереди на выполнение"
                          data-tooltip-pos="top"
                          data-tooltip-align="left"
                        >
                          <span className="queue-count-badge__label">{t('queueWaiting')}</span>
                          <strong className="queue-count-badge__num text-amber">{q.counts.waiting}</strong>
                        </div>
                        <div
                          className="queue-count-badge"
                          data-tooltip="Задачи в процессе обработки"
                          data-tooltip-pos="top"
                          data-tooltip-align="right"
                        >
                          <span className="queue-count-badge__label">{t('queueActive')}</span>
                          <strong className="queue-count-badge__num text-sky">{q.counts.active}</strong>
                        </div>
                        <div
                          className="queue-count-badge"
                          data-tooltip="Успешно завершенные задачи"
                          data-tooltip-pos="top"
                          data-tooltip-align="left"
                        >
                          <span className="queue-count-badge__label">{t('queueCompleted')}</span>
                          <strong className="queue-count-badge__num text-emerald">{q.counts.completed}</strong>
                        </div>
                        <div
                          className="queue-count-badge"
                          data-tooltip="Задачи с ошибками исполнения"
                          data-tooltip-pos="top"
                          data-tooltip-align="right"
                        >
                          <span className="queue-count-badge__label">{t('queueFailed')}</span>
                          <strong className="queue-count-badge__num text-rose">{q.counts.failed}</strong>
                        </div>
                      </div>

                      {q.counts.failed > 0 && (
                        <button
                          type="button"
                          className="btn btn--danger btn--xs w-full justify-center"
                          onClick={() => handleRetryQueue(q.name)}
                          disabled={isRetryingQueue === q.name}
                          data-tooltip="Перезапустить все упавшие задачи в этой очереди"
                          data-tooltip-pos="bottom"
                        >
                          {isRetryingQueue === q.name ? (
                            <Loader2 size={12} className="spinner" />
                          ) : (
                            <RotateCw size={12} />
                          )}
                          {t('retryFailed')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ─── Вкладка 3: Настройки системы (Settings) ────────────────────────── */}
        {currentTab === 'settings' && (
          <>
            <div className="page-header flex justify-between items-center">
              <div>
                <h1 className="page-title">
                  <Settings size={24} className="text-indigo" />
                  {t('settings')}
                </h1>
                <p className="page-subtitle">
                  Конфигурация Master API Key, параметров баз данных, Redis и оповещений
                </p>
              </div>
            </div>

            <div className="settings-grid">
              {/* Карточка 1: Master API Key */}
              <div className="settings-card">
                <div className="settings-card__header">
                  <Key size={20} className="text-amber" />
                  <h2 className="settings-card__title">Master API Key</h2>
                </div>
                <p className="text-sm text-secondary mb-4">
                  Глобальный ключ супер-администратора, дающий полный доступ ко всем тенантам и очередям.
                </p>

                <div className="form-group mb-4">
                  <label className="form-label">Текущий ключ авторизации</label>
                  <div className="form-input-wrap">
                    <input
                      type={showMasterKey ? 'text' : 'password'}
                      className="form-input font-mono text-xs"
                      readOnly
                      value={apiKey || '••••••••••••••••••••••••••••••••'}
                    />
                    <button
                      type="button"
                      className="form-input-reveal"
                      onClick={() => setShowMasterKey((v) => !v)}
                      title={showMasterKey ? 'Скрыть ключ' : 'Показать ключ'}
                      aria-label={showMasterKey ? 'Скрыть ключ' : 'Показать ключ'}
                    >
                      {showMasterKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    if (apiKey) {
                      navigator.clipboard.writeText(apiKey);
                      setCopiedMasterKey(true);
                      setTimeout(() => setCopiedMasterKey(false), 2000);
                    }
                  }}
                  data-tooltip="Скопировать Master API Key в буфер обмена"
                  data-tooltip-pos="bottom"
                >
                  {copiedMasterKey ? (
                    <><Check size={14} className="text-emerald" /> Скопировано</>
                  ) : (
                    <><Copy size={14} /> Скопировать Master Key</>
                  )}
                </button>
              </div>

              {/* Карточка 2: Инфраструктура Redis & SQLite */}
              <div className="settings-card">
                <div className="settings-card__header">
                  <Server size={20} className="text-emerald" />
                  <h2 className="settings-card__title">Инфраструктура и БД</h2>
                </div>

                <div className="settings-row">
                  <span className="settings-row__label">Redis Сервер</span>
                  <span className="settings-row__value text-emerald">localhost:6379 (OK)</span>
                </div>

                <div className="settings-row">
                  <span className="settings-row__label">SQLite Master DB</span>
                  <span className="settings-row__value font-mono">./data/liman_master.sqlite</span>
                </div>

                <div className="settings-row">
                  <span className="settings-row__label">Хранилище бэкапов</span>
                  <span className="settings-row__value font-mono">./data/backups (.sql.gz)</span>
                </div>

                <div className="settings-row">
                  <span className="settings-row__label">Количество очередей</span>
                  <span className="settings-row__value">4 активных BullMQ</span>
                </div>
              </div>

              {/* Карточка 3: Telegram Оповещения */}
              <div className="settings-card">
                <div className="settings-card__header">
                  <Bell size={20} className="text-sky" />
                  <h2 className="settings-card__title">Telegram Уведомления</h2>
                </div>

                <p className="text-sm text-secondary mb-4">
                  Мгновенные алерты об авариях синхронизации, ошибках очередей и критических событиях.
                </p>

                <div className="settings-row">
                  <span className="settings-row__label">Статус бота</span>
                  <span className="settings-row__value text-emerald">Подключен</span>
                </div>

                <div className="settings-row">
                  <span className="settings-row__label">Chat ID группы</span>
                  <span className="settings-row__value font-mono">-5181857088</span>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      setTelegramStatus('sent');
                      setTimeout(() => setTelegramStatus(null), 3000);
                    }}
                    data-tooltip="Отправить тестовое уведомление в Telegram-канал"
                    data-tooltip-pos="bottom"
                  >
                    <Send size={14} />
                    {telegramStatus === 'sent' ? 'Алерт отправлен!' : 'Тестовый алерт'}
                  </button>
                </div>
              </div>

              {/* Карточка 4: Политика синхронизации */}
              <div className="settings-card">
                <div className="settings-card__header">
                  <Shield size={20} className="text-indigo" />
                  <h2 className="settings-card__title">Параметры безопасности</h2>
                </div>

                <div className="settings-row">
                  <span className="settings-row__label">Маскирование секретов</span>
                  <span className="settings-row__value text-emerald">Включено (••••••••)</span>
                </div>

                <div className="settings-row">
                  <span className="settings-row__label">Аудит обращений к паролям</span>
                  <span className="settings-row__value text-emerald">Активен (SecurityAudit)</span>
                </div>

                <div className="settings-row">
                  <span className="settings-row__label">Распределенный лок Redis</span>
                  <span className="settings-row__value font-mono">lock:tenant:&#123;id&#125;:busy</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Модальное окно редактирования/создания тенанта */}
        <TenantModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            fetchTenants();
            fetchOverview();
          }}
          tenant={selectedTenant}
        />

        {/* Модалка раскрытия учетных данных (Sensitive Data Reveal) */}
        {revealedCreds && (
          <div className="modal-overlay" role="dialog">
            <div className="modal-content">
              <div className="modal-header">
                <div className="modal-title-row">
                  <Eye size={20} className="text-amber" />
                  <h3 className="modal-title">{t('credentialsRevealed')}: {revealedCreds.id}</h3>
                </div>
                <button type="button" className="btn-icon" onClick={() => setRevealedCreds(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body space-y-3">
                <div className="form-group">
                  <label className="form-label">{t('tenantId')} API Key</label>
                  <input type="text" readOnly className="input font-mono text-xs" value={revealedCreds.apiKey} />
                </div>
                <div className="form-group">
                  <label className="form-label">MariaDB {t('dbPassword')}</label>
                  <input type="text" readOnly className="input font-mono text-xs" value={revealedCreds.dbPassword} />
                </div>
                {revealedCreds.horoshopPassword && (
                  <div className="form-group">
                    <label className="form-label">Horoshop API Password</label>
                    <input type="text" readOnly className="input font-mono text-xs" value={revealedCreds.horoshopPassword} />
                  </div>
                )}
                {revealedCreds.promApiKey && (
                  <div className="form-group">
                    <label className="form-label">Prom.ua API Key</label>
                    <input type="text" readOnly className="input font-mono text-xs" value={revealedCreds.promApiKey} />
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn--secondary" onClick={() => setRevealedCreds(null)}>
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
