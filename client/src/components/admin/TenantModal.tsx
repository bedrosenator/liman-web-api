import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { tenantsApi } from '@/api/client';
import {
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Store,
  Key,
} from 'lucide-react';

export interface TenantData {
  id: string;
  name: string;
  isActive: boolean;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword?: string;
  priceColumn: string;
  stockColumn: string;
  syncIntervalMinutes: number;
  horoshopShopTitle?: string;
  horoshopDomain?: string;
  horoshopLogin?: string;
  horoshopPassword?: string;
  horoshopExportEnabled?: boolean;
  horoshopOrderWebhookEnabled?: boolean;
  horoshopProductCreationWebhookEnabled?: boolean;
  horoshopSyncIntervalMinutes?: number;
  promApiKey?: string;
  promExportEnabled?: boolean;
  rozetkaClientId?: string;
  rozetkaClientSecret?: string;
  rozetkaExportEnabled?: boolean;
  woocommerceUrl?: string;
  woocommerceConsumerKey?: string;
  woocommerceConsumerSecret?: string;
  woocommerceSyncEnabled?: boolean;
  woocommerceOrderWebhookEnabled?: boolean;
  woocommerceCreateOrderDocumentEnabled?: boolean;
  apiKey?: string;
}

interface TenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenant?: TenantData | null;
}

export function TenantModal({ isOpen, onClose, onSaved, tenant }: TenantModalProps) {
  const { t } = useLanguage();
  const isEdit = Boolean(tenant);

  const [formData, setFormData] = useState<TenantData>({
    id: '',
    name: '',
    isActive: true,
    dbHost: '127.0.0.1',
    dbPort: 3306,
    dbName: 'columbDB',
    dbUser: 'root',
    dbPassword: '',
    priceColumn: 'cena2',
    stockColumn: 'skl_k',
    syncIntervalMinutes: 15,
    horoshopDomain: '',
    horoshopLogin: '',
    horoshopPassword: '',
    horoshopExportEnabled: false,
    promApiKey: '',
    promExportEnabled: false,
    rozetkaClientId: '',
    rozetkaClientSecret: '',
    rozetkaExportEnabled: false,
    woocommerceUrl: '',
    woocommerceConsumerKey: '',
    woocommerceConsumerSecret: '',
    woocommerceSyncEnabled: false,
    woocommerceOrderWebhookEnabled: true,
    woocommerceCreateOrderDocumentEnabled: false,
  });

  const [activeTab, setActiveTab] = useState<'general' | 'database' | 'horoshop' | 'marketplaces'>('general');
  const [showPassword, setShowPassword] = useState(false);
  const [showHoroshopPassword, setShowHoroshopPassword] = useState(false);
  const [showPromApiKey, setShowPromApiKey] = useState(false);
  const [showRozetkaSecret, setShowRozetkaSecret] = useState(false);
  const [showWooSecret, setShowWooSecret] = useState(false);
  const [isRevealingCredentials, setIsRevealingCredentials] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string; pingMs?: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setFormData({
        ...tenant,
        dbPassword: tenant.dbPassword || '',
        horoshopPassword: tenant.horoshopPassword || '',
      });
    } else {
      setFormData({
        id: '',
        name: '',
        isActive: true,
        dbHost: '127.0.0.1',
        dbPort: 3306,
        dbName: '',
        dbUser: 'root',
        dbPassword: '',
        priceColumn: 'cena2',
        stockColumn: 'skl_k',
        syncIntervalMinutes: 15,
        horoshopDomain: '',
        horoshopLogin: '',
        horoshopPassword: '',
        horoshopExportEnabled: false,
        promApiKey: '',
        promExportEnabled: false,
        rozetkaClientId: '',
        rozetkaClientSecret: '',
        rozetkaExportEnabled: false,
        woocommerceUrl: '',
        woocommerceConsumerKey: '',
        woocommerceConsumerSecret: '',
        woocommerceSyncEnabled: false,
        woocommerceOrderWebhookEnabled: true,
        woocommerceCreateOrderDocumentEnabled: false,
      });
    }
    setShowPassword(false);
    setShowHoroshopPassword(false);
    setShowPromApiKey(false);
    setShowRozetkaSecret(false);
    setShowWooSecret(false);
    setIsRevealingCredentials(false);
    setDbTestResult(null);
    setErrorMessage(null);
  }, [tenant, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof TenantData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const ensureCredentialsRevealed = async () => {
    if (!isEdit || !formData.id) return;
    const isMasked = (val?: string) => !val || val === '••••••••' || val === '********';
    if (
      isMasked(formData.dbPassword) ||
      isMasked(formData.horoshopPassword) ||
      isMasked(formData.promApiKey) ||
      isMasked(formData.rozetkaClientSecret) ||
      isMasked(formData.woocommerceConsumerSecret)
    ) {
      setIsRevealingCredentials(true);
      try {
        const res = await tenantsApi.revealCredentials(formData.id);
        const data = res.data;
        setFormData((prev) => ({
          ...prev,
          dbPassword: isMasked(prev.dbPassword) ? data.dbPassword || '' : prev.dbPassword,
          horoshopPassword: isMasked(prev.horoshopPassword) ? data.horoshopPassword || '' : prev.horoshopPassword,
          promApiKey: isMasked(prev.promApiKey) ? data.promApiKey || '' : prev.promApiKey,
          rozetkaClientSecret: isMasked(prev.rozetkaClientSecret) ? data.rozetkaClientSecret || '' : prev.rozetkaClientSecret,
          woocommerceConsumerSecret: isMasked(prev.woocommerceConsumerSecret) ? data.woocommerceConsumerSecret || '' : prev.woocommerceConsumerSecret,
        }));
      } catch (err: any) {
        console.error('Ошибка получения учетных данных:', err);
      } finally {
        setIsRevealingCredentials(false);
      }
    }
  };

  const handleToggleDbPassword = async () => {
    if (showPassword) {
      setShowPassword(false);
    } else {
      await ensureCredentialsRevealed();
      setShowPassword(true);
    }
  };

  const handleToggleHoroshopPassword = async () => {
    if (showHoroshopPassword) {
      setShowHoroshopPassword(false);
    } else {
      await ensureCredentialsRevealed();
      setShowHoroshopPassword(true);
    }
  };

  const handleTogglePromApiKey = async () => {
    if (showPromApiKey) {
      setShowPromApiKey(false);
    } else {
      await ensureCredentialsRevealed();
      setShowPromApiKey(true);
    }
  };

  const handleToggleRozetkaSecret = async () => {
    if (showRozetkaSecret) {
      setShowRozetkaSecret(false);
    } else {
      await ensureCredentialsRevealed();
      setShowRozetkaSecret(true);
    }
  };

  const handleToggleWooSecret = async () => {
    if (showWooSecret) {
      setShowWooSecret(false);
    } else {
      await ensureCredentialsRevealed();
      setShowWooSecret(true);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.id) {
      setDbTestResult({
        success: false,
        message: 'Для теста сначала сохраните ID магазина',
      });
      return;
    }
    setIsTestingDb(true);
    setDbTestResult(null);
    try {
      const res = await tenantsApi.ping(formData.id);
      setDbTestResult(res.data);
    } catch (err: any) {
      setDbTestResult({
        success: false,
        message: err.response?.data?.message || err.message || t('testConnectionFailed'),
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = { ...formData };
      const isMasked = (val?: string) => !val || val === '••••••••' || val === '********';
      if (isEdit && isMasked(payload.dbPassword)) delete payload.dbPassword;
      if (isEdit && isMasked(payload.horoshopPassword)) delete payload.horoshopPassword;
      if (isEdit && isMasked(payload.promApiKey)) delete payload.promApiKey;
      if (isEdit && isMasked(payload.rozetkaClientSecret)) delete payload.rozetkaClientSecret;
      if (isEdit && isMasked(payload.woocommerceConsumerSecret)) delete payload.woocommerceConsumerSecret;

      if (isEdit) {
        await tenantsApi.update(formData.id, payload);
      } else {
        await tenantsApi.create(formData);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message || err.message || 'Ошибка сохранения клиента',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content modal-content--wide">
        <div className="modal-header">
          <div className="modal-title-row">
            <Store size={22} className="text-indigo" />
            <h2 className="modal-title">
              {isEdit ? `${t('editTenant')}: ${formData.name || formData.id}` : t('newTenant')}
            </h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('close')}>
            <X size={20} />
          </button>
        </div>

        {/* Навигация по табам */}
        <div className="modal-tabs">
          <button
            type="button"
            className={`modal-tab ${activeTab === 'general' ? 'modal-tab--active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            {t('settings')}
          </button>
          <button
            type="button"
            className={`modal-tab ${activeTab === 'database' ? 'modal-tab--active' : ''}`}
            onClick={() => setActiveTab('database')}
          >
            <Database size={16} />
            MariaDB Limansoft
          </button>
          <button
            type="button"
            className={`modal-tab ${activeTab === 'horoshop' ? 'modal-tab--active' : ''}`}
            onClick={() => setActiveTab('horoshop')}
          >
            {t('horoshop')}
          </button>
          <button
            type="button"
            className={`modal-tab ${activeTab === 'marketplaces' ? 'modal-tab--active' : ''}`}
            onClick={() => setActiveTab('marketplaces')}
          >
            Prom / Rozetka / Woo
          </button>
        </div>

        {errorMessage && (
          <div className="alert alert--danger">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-body">
          {activeTab === 'general' && (
            <div className="form-grid">
              <div className="form-group form-group--full">
                <label className="form-label">{t('tenantName')} *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  placeholder="e.g. Columb Shop"
                />
              </div>

              <div className="form-group form-group--full">
                <label className="form-label">{t('tenantId')} *</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.id}
                  onChange={(e) => handleChange('id', e.target.value.toLowerCase().trim())}
                  disabled={isEdit}
                  required
                  placeholder="e.g. columb"
                />
                <span className="form-hint">Только латиница, цифры и дефис. Используется в URL и API.</span>
              </div>

              <div className="form-group">
                <label className="form-label">{t('tenantStatus')}</label>
                <select
                  className="select"
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => handleChange('isActive', e.target.value === 'true')}
                >
                  <option value="true">{t('active')}</option>
                  <option value="false">{t('inactive')}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('syncInterval')}</label>
                <select
                  className="select"
                  value={formData.syncIntervalMinutes}
                  onChange={(e) => handleChange('syncIntervalMinutes', parseInt(e.target.value, 10))}
                >
                  <option value={15}>{t('interval15Min')}</option>
                  <option value={30}>{t('interval30Min')}</option>
                  <option value={60}>{t('interval60Min')}</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'database' && (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t('dbHost')} *</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.dbHost}
                  onChange={(e) => handleChange('dbHost', e.target.value)}
                  required
                  placeholder="127.0.0.1"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('dbPort')} *</label>
                <input
                  type="number"
                  className="input font-mono"
                  value={formData.dbPort}
                  onChange={(e) => handleChange('dbPort', parseInt(e.target.value, 10))}
                  required
                  placeholder="3306"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('dbName')} *</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.dbName}
                  onChange={(e) => handleChange('dbName', e.target.value)}
                  required
                  placeholder="columbDB"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('dbUser')} *</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.dbUser}
                  onChange={(e) => handleChange('dbUser', e.target.value)}
                  required
                  placeholder="root"
                />
              </div>

              <div className="form-group form-group--full">
                <label className="form-label">{t('dbPassword')}</label>
                <div className="input-group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input font-mono"
                    value={formData.dbPassword || ''}
                    onChange={(e) => handleChange('dbPassword', e.target.value)}
                    placeholder={isEdit ? '•••••••• (оставьте пустым для сохранения текущего)' : 'Пароль к БД'}
                  />
                  <button
                    type="button"
                    onClick={handleToggleDbPassword}
                    disabled={isRevealingCredentials}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {isRevealingCredentials ? (
                      <Loader2 size={16} className="spinner" />
                    ) : showPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('priceColumn')} (цена)</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.priceColumn}
                  onChange={(e) => handleChange('priceColumn', e.target.value)}
                  placeholder="cena2"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('stockColumn')} (остаток)</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.stockColumn}
                  onChange={(e) => handleChange('stockColumn', e.target.value)}
                  placeholder="skl_k"
                />
              </div>

              <div className="form-group form-group--full mt-2">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={handleTestConnection}
                  disabled={isTestingDb}
                >
                  {isTestingDb ? <Loader2 size={16} className="spinner" /> : <Database size={16} />}
                  {t('testConnection')}
                </button>

                {dbTestResult && (
                  <div className={`mt-2 alert ${dbTestResult.success ? 'alert--success' : 'alert--danger'}`}>
                    {dbTestResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span>
                      {dbTestResult.message}
                      {dbTestResult.pingMs !== undefined && ` (${dbTestResult.pingMs} ms)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'horoshop' && (
            <div className="form-grid">
              <div className="form-group form-group--full">
                <label className="form-label">{t('horoshopDomain')}</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.horoshopDomain || ''}
                  onChange={(e) => handleChange('horoshopDomain', e.target.value.trim())}
                  placeholder="shop724088.horoshop.ua"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('horoshopLogin')}</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.horoshopLogin || ''}
                  onChange={(e) => handleChange('horoshopLogin', e.target.value.trim())}
                  placeholder="liman_api"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('horoshopPassword')}</label>
                <div className="input-group">
                  <input
                    type={showHoroshopPassword ? 'text' : 'password'}
                    className="input font-mono"
                    value={formData.horoshopPassword || ''}
                    onChange={(e) => handleChange('horoshopPassword', e.target.value)}
                    placeholder={isEdit ? '••••••••' : 'Пароль к Хорошоп API'}
                  />
                  <button
                    type="button"
                    onClick={handleToggleHoroshopPassword}
                    disabled={isRevealingCredentials}
                    aria-label={showHoroshopPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    title={showHoroshopPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {isRevealingCredentials ? (
                      <Loader2 size={16} className="spinner" />
                    ) : showHoroshopPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="form-group form-group--full mt-2 space-y-2">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.horoshopExportEnabled || false}
                    onChange={(e) => handleChange('horoshopExportEnabled', e.target.checked)}
                  />
                  <span>{t('autoSync')} Хорошоп</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.horoshopOrderWebhookEnabled ?? true}
                    onChange={(e) => handleChange('horoshopOrderWebhookEnabled', e.target.checked)}
                  />
                  <span>{t('orderWebhook')}</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.horoshopProductCreationWebhookEnabled || false}
                    onChange={(e) => handleChange('horoshopProductCreationWebhookEnabled', e.target.checked)}
                  />
                  <span>{t('productWebhook')}</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'marketplaces' && (
            <div className="space-y-4">
              <div className="card card--subtle p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="badge badge--indigo">{t('prom')}</span>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('promApiKey')}</label>
                  <div className="input-group">
                    <input
                      type={showPromApiKey ? 'text' : 'password'}
                      className="input font-mono"
                      value={formData.promApiKey || ''}
                      onChange={(e) => handleChange('promApiKey', e.target.value)}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={handleTogglePromApiKey}
                      disabled={isRevealingCredentials}
                      aria-label={showPromApiKey ? 'Скрыть ключ' : 'Показать ключ'}
                      title={showPromApiKey ? 'Скрыть ключ' : 'Показать ключ'}
                    >
                      {isRevealingCredentials ? (
                        <Loader2 size={16} className="spinner" />
                      ) : showPromApiKey ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="card card--subtle p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="badge badge--emerald">{t('rozetka')}</span>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">{t('rozetkaClientId')}</label>
                    <input
                      type="text"
                      className="input font-mono"
                      value={formData.rozetkaClientId || ''}
                      onChange={(e) => handleChange('rozetkaClientId', e.target.value)}
                      placeholder="e.g. 123456"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('rozetkaSecret')}</label>
                    <div className="input-group">
                      <input
                        type={showRozetkaSecret ? 'text' : 'password'}
                        className="input font-mono"
                        value={formData.rozetkaClientSecret || ''}
                        onChange={(e) => handleChange('rozetkaClientSecret', e.target.value)}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={handleToggleRozetkaSecret}
                        disabled={isRevealingCredentials}
                        aria-label={showRozetkaSecret ? 'Скрыть секрет' : 'Показать секрет'}
                        title={showRozetkaSecret ? 'Скрыть секрет' : 'Показать секрет'}
                      >
                        {isRevealingCredentials ? (
                          <Loader2 size={16} className="spinner" />
                        ) : showRozetkaSecret ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card card--subtle p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="badge badge--amber">{t('woocommerce')}</span>
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">{t('woocommerceUrl')}</label>
                  <input
                    type="url"
                    className="input font-mono"
                    value={formData.woocommerceUrl || ''}
                    onChange={(e) => handleChange('woocommerceUrl', e.target.value)}
                    placeholder="https://myshop.com"
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">{t('woocommerceKey')}</label>
                    <input
                      type="password"
                      className="input font-mono"
                      value={formData.woocommerceConsumerKey || ''}
                      onChange={(e) => handleChange('woocommerceConsumerKey', e.target.value)}
                      placeholder="ck_••••••••"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('woocommerceSecret')}</label>
                    <div className="input-group">
                      <input
                        type={showWooSecret ? 'text' : 'password'}
                        className="input font-mono"
                        value={formData.woocommerceConsumerSecret || ''}
                        onChange={(e) => handleChange('woocommerceConsumerSecret', e.target.value)}
                        placeholder="cs_••••••••"
                      />
                      <button
                        type="button"
                        onClick={handleToggleWooSecret}
                        disabled={isRevealingCredentials}
                        aria-label={showWooSecret ? 'Скрыть секрет' : 'Показать секрет'}
                        title={showWooSecret ? 'Скрыть секрет' : 'Показать секрет'}
                      >
                        {isRevealingCredentials ? (
                          <Loader2 size={16} className="spinner" />
                        ) : showWooSecret ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-group form-group--full mt-2 space-y-2">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.woocommerceSyncEnabled || false}
                      onChange={(e) => handleChange('woocommerceSyncEnabled', e.target.checked)}
                    />
                    <span>{t('autoSync')} WooCommerce</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.woocommerceOrderWebhookEnabled ?? true}
                      onChange={(e) => handleChange('woocommerceOrderWebhookEnabled', e.target.checked)}
                    />
                    <span>Авто-списание по вебхуку заказов WooCommerce</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.woocommerceCreateOrderDocumentEnabled || false}
                      onChange={(e) => handleChange('woocommerceCreateOrderDocumentEnabled', e.target.checked)}
                    />
                    <span>Создавать черновик накладной tip_dok:85 в Limansoft (экспериментально)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={isSaving}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn--primary" disabled={isSaving}>
              {isSaving ? <Loader2 size={16} className="spinner" /> : <Key size={16} />}
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
