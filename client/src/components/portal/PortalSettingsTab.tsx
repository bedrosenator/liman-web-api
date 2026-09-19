import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Activity,
  Layers,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { tenantsApi } from '@/api/client';

interface PortalSettingsTabProps {
  tenantId: string;
  tenant: any;
  onTenantUpdated: () => void;
}

export const PortalSettingsTab: React.FC<PortalSettingsTabProps> = ({
  tenantId,
  tenant,
  onTenantUpdated,
}) => {
  const { t, language } = useLanguage();

  // Form State
  const [name, setName] = useState(tenant?.name || '');
  const [dbHost, setDbHost] = useState(tenant?.dbHost || '');
  const [dbPort, setDbPort] = useState(tenant?.dbPort || 3306);
  const [dbName, setDbName] = useState(tenant?.dbName || '');
  const [dbUser, setDbUser] = useState(tenant?.dbUser || '');
  const [dbPassword, setDbPassword] = useState('');
  const [priceColumn, setPriceColumn] = useState(tenant?.priceColumn || 'cena2');
  const [stockColumn, setStockColumn] = useState(tenant?.stockColumn || 'skl_k');
  const [publicBaseUrl, setPublicBaseUrl] = useState(tenant?.publicBaseUrl || '');

  // Status & Key State
  const [apiKey, setApiKey] = useState(tenant?.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isKeyCopied, setIsKeyCopied] = useState(false);

  // Ping State
  const [pingStatus, setPingStatus] = useState<{
    loading: boolean;
    success?: boolean;
    pingMs?: number;
    message?: string;
  }>({ loading: false });

  // Save State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || '');
      setDbHost(tenant.dbHost || '');
      setDbPort(tenant.dbPort || 3306);
      setDbName(tenant.dbName || '');
      setDbUser(tenant.dbUser || '');
      setPriceColumn(tenant.priceColumn || 'cena2');
      setStockColumn(tenant.stockColumn || 'skl_k');
      setPublicBaseUrl(tenant.publicBaseUrl || '');
      setApiKey(tenant.apiKey || '');
    }
  }, [tenant]);

  const handlePing = async () => {
    setPingStatus({ loading: true });
    try {
      const res = await tenantsApi.ping(tenantId);
      setPingStatus({
        loading: false,
        success: res.data?.success,
        pingMs: res.data?.pingMs,
        message: res.data?.message || t('statusConnected'),
      });
    } catch (err: any) {
      setPingStatus({
        loading: false,
        success: false,
        message: err.response?.data?.message || err.message || t('statusDisconnected'),
      });
    }
  };

  const handleCopyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setIsKeyCopied(true);
    setTimeout(() => setIsKeyCopied(false), 2500);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        dbHost: dbHost.trim(),
        dbPort: Number(dbPort),
        dbName: dbName.trim(),
        dbUser: dbUser.trim(),
        priceColumn: priceColumn.trim(),
        stockColumn: stockColumn.trim(),
        publicBaseUrl: publicBaseUrl.trim(),
      };

      if (dbPassword) {
        payload.dbPassword = dbPassword;
      }

      await tenantsApi.update(tenantId, payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onTenantUpdated();
      handlePing();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || err.message || t('error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6" id="portal-settings-tab">
      {/* Header & Save Bar */}
      <div className="card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings size={22} className="text-indigo" />
            <h2 className="text-lg font-bold text-primary">
              {language === 'uk'
                ? 'Налаштування магазину та БД'
                : 'Настройки магазина и БД'}
            </h2>
          </div>
          <p className="text-xs text-secondary mt-1 max-w-xl">
            {language === 'uk'
              ? 'Конфігурація облікової бази даних Limansoft, колонок цін і ключів API.'
              : 'Конфигурация учетной базы данных Limansoft, колонок цен и ключей API.'}
          </p>
        </div>

        <button
          type="submit"
          className="btn btn--primary btn--sm gap-2 self-start md:self-auto flex-shrink-0"
          disabled={isSaving}
          id="btn-save-portal-settings"
        >
          {isSaving ? <Loader2 size={15} className="spinner" /> : <Save size={15} />}
          <span>{t('save')}</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-lg bg-emerald/10 border border-emerald/20 text-emerald text-xs flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{language === 'uk' ? 'Налаштування успішно збережено' : 'Настройки успешно сохранены'}</span>
        </div>
      )}

      {saveError && (
        <div className="p-3.5 rounded-lg bg-rose/10 border border-rose/20 text-rose text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. MariaDB Connection */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-subtle pb-3">
            <div className="flex items-center gap-2 font-bold text-sm text-primary">
              <Database size={17} className="text-indigo" />
              <span>{language === 'uk' ? 'Підключення MariaDB (Limansoft)' : 'Подключение MariaDB (Limansoft)'}</span>
            </div>

            <button
              type="button"
              className="btn btn--secondary btn--xs gap-1"
              onClick={handlePing}
              disabled={pingStatus.loading}
              title={t('testConnection')}
            >
              {pingStatus.loading ? (
                <Loader2 size={12} className="spinner" />
              ) : (
                <Activity size={12} />
              )}
              <span>{t('testConnection')}</span>
            </button>
          </div>

          {/* Status badge */}
          {pingStatus.success !== undefined && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                pingStatus.success
                  ? 'bg-emerald/10 text-emerald border border-emerald/20'
                  : 'bg-rose/10 text-rose border border-rose/20'
              }`}
            >
              {pingStatus.success ? (
                <CheckCircle2 size={15} />
              ) : (
                <AlertCircle size={15} />
              )}
              <span>
                {pingStatus.message}{' '}
                {pingStatus.pingMs !== undefined ? `(${pingStatus.pingMs} ms)` : ''}
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 form-group">
              <label className="form-label">{t('dbHost')}</label>
              <input
                type="text"
                value={dbHost}
                onChange={(e) => setDbHost(e.target.value)}
                className="input font-mono"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('dbPort')}</label>
              <input
                type="number"
                value={dbPort}
                onChange={(e) => setDbPort(Number(e.target.value))}
                className="input font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">{t('dbName')}</label>
              <input
                type="text"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                className="input font-mono"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('dbUser')}</label>
              <input
                type="text"
                value={dbUser}
                onChange={(e) => setDbUser(e.target.value)}
                className="input font-mono"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('dbPassword')}</label>
            <input
              type="password"
              placeholder={tenant?.dbPassword ? '••••••••' : ''}
              value={dbPassword}
              onChange={(e) => setDbPassword(e.target.value)}
              className="input font-mono"
            />
            <span className="form-hint">
              {language === 'uk'
                ? 'Залиште порожнім, щоб не змінювати поточний пароль.'
                : 'Оставьте пустым, чтобы не менять текущий пароль.'}
            </span>
          </div>
        </div>

        {/* 2. Columns & Base Settings */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-primary border-b border-subtle pb-3">
            <Layers size={17} className="text-sky" />
            <span>{language === 'uk' ? 'Колонки обліку та медіа' : 'Колонки учета и медиа'}</span>
          </div>

          <div className="form-group">
            <label className="form-label">{t('tenantName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">{t('priceColumn')}</label>
              <input
                type="text"
                value={priceColumn}
                onChange={(e) => setPriceColumn(e.target.value)}
                className="input font-mono"
                placeholder="cena2"
                required
              />
              <span className="form-hint">
                {language === 'uk' ? 'Роздрібна ціна (name2)' : 'Розничная цена (name2)'}
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">{t('stockColumn')}</label>
              <input
                type="text"
                value={stockColumn}
                onChange={(e) => setStockColumn(e.target.value)}
                className="input font-mono"
                placeholder="skl_k"
                required
              />
              <span className="form-hint">
                {language === 'uk' ? 'Основний склад (name2ost)' : 'Основной склад (name2ost)'}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Public Base URL</label>
            <input
              type="url"
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
              className="input font-mono"
              placeholder="https://liman.terrace.pp.ua"
            />
            <span className="form-hint">
              {language === 'uk'
                ? 'Публічний домен сервісу для віддачі фото товарів у маркетплейси.'
                : 'Публичный домен сервиса для раздачи фото товаров в маркетплейсы.'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. API Key Card */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm text-primary border-b border-subtle pb-3">
          <Key size={17} className="text-amber" />
          <span>{language === 'uk' ? 'API Ключ клієнта (Tenant API Key)' : 'API Ключ клиента (Tenant API Key)'}</span>
        </div>

        <p className="text-xs text-secondary leading-relaxed">
          {language === 'uk'
            ? 'Цей персональний ключ використовується для авторизації зовнішніх вебхуків, плагінів та прямої взаємодії з REST API.'
            : 'Этот персональный ключ используется для авторизации внешних вебхуков, плагинов и прямого взаимодействия с REST API.'}
        </p>

        <div className="flex items-center gap-3">
          <div className="input-group flex-1">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              readOnly
              className="input font-mono bg-elevated"
            />
            <button
              type="button"
              className="form-input-reveal"
              onClick={() => setShowApiKey(!showApiKey)}
              title={showApiKey ? t('hidePassword') : t('revealPassword')}
              aria-label={showApiKey ? 'Hide' : 'Show'}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button
            type="button"
            className="btn btn--secondary btn--sm gap-1.5 flex-shrink-0"
            onClick={handleCopyKey}
          >
            {isKeyCopied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
            <span>{isKeyCopied ? t('copied') : t('copy')}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
