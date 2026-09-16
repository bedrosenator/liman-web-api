import React, { useState, useId } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Eye, EyeOff, Zap, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { apiClient } from '@/api/client';

/**
 * Экран авторизации.
 * Поддерживает вход по Master Key (superadmin) или по ключу тенанта.
 */
export function LoginPage() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [tenantIdInput, setTenantIdInput] = useState('');
  const [mode, setMode] = useState<'superadmin' | 'tenant'>('superadmin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = searchParams.get('reason');
  const apiKeyId = useId();
  const tenantId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Проверяем ключ через API
      const endpoint =
        mode === 'superadmin'
          ? '/admin/ping'
          : `/liman/${tenantIdInput.trim()}/ping`;

      await apiClient.get(endpoint, {
        headers: { 'x-api-key': apiKey.trim() },
      });

      login(
        apiKey.trim(),
        mode,
        mode === 'tenant' ? tenantIdInput.trim() : undefined,
      );

      if (mode === 'superadmin') {
        navigate('/superadmin');
      } else {
        navigate(`/portal/${tenantIdInput.trim()}`);
      }
    } catch {
      setError(t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" id="login-page">
      {/* Animated background */}
      <div className="login-bg" aria-hidden="true">
        <div className="login-bg__orb login-bg__orb--1" />
        <div className="login-bg__orb login-bg__orb--2" />
        <div className="login-bg__orb login-bg__orb--3" />
      </div>

      {/* Lang selector top right */}
      <div className="login-lang">
        <LanguageSelector />
      </div>

      <div className="login-card" role="main">
        {/* Header */}
        <div className="login-card__header">
          <div className="login-card__icon">
            <Zap size={32} />
          </div>
          <h1 className="login-card__title">{t('loginTitle')}</h1>
          <p className="login-card__subtitle">{t('loginSubtitle')}</p>
        </div>

        {/* Session expired / access denied warning */}
        {reason && (
          <div className="alert alert--warning" role="alert">
            <AlertCircle size={16} />
            <span>
              {reason === 'session_expired'
                ? 'Сессия истекла. Пожалуйста, войдите снова.'
                : 'Недостаточно прав доступа.'}
            </span>
          </div>
        )}

        <form className="login-card__form" onSubmit={handleSubmit} noValidate>
          {/* Mode toggle */}
          <div className="mode-toggle" role="group" aria-label="Login mode">
            <button
              type="button"
              id="mode-superadmin"
              className={`mode-toggle__btn ${mode === 'superadmin' ? 'mode-toggle__btn--active' : ''}`}
              onClick={() => setMode('superadmin')}
            >
              Super Admin
            </button>
            <button
              type="button"
              id="mode-tenant"
              className={`mode-toggle__btn ${mode === 'tenant' ? 'mode-toggle__btn--active' : ''}`}
              onClick={() => setMode('tenant')}
            >
              {t('clientPortal')}
            </button>
          </div>

          {/* Tenant ID field (only for tenant mode) */}
          {mode === 'tenant' && (
            <div className="form-field">
              <label htmlFor={tenantId} className="form-label">
                {t('tenantId')}
              </label>
              <input
                id={tenantId}
                type="text"
                className="form-input"
                placeholder="columb"
                value={tenantIdInput}
                onChange={(e) => setTenantIdInput(e.target.value)}
                required={mode === 'tenant'}
                autoComplete="off"
              />
            </div>
          )}

          {/* API Key field */}
          <div className="form-field">
            <label htmlFor={apiKeyId} className="form-label">
              {t('enterApiKey')}
            </label>
            <div className="form-input-wrap">
              <input
                id={apiKeyId}
                type={showKey ? 'text' : 'password'}
                className="form-input form-input--with-btn"
                placeholder={t('apiKeyPlaceholder')}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                id="toggle-key-visibility"
                className="form-input-reveal"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Hint */}
          {mode === 'superadmin' && (
            <p className="login-hint">{t('masterKeyHint')}</p>
          )}

          {/* Error */}
          {error && (
            <div className="alert alert--error" role="alert" id="login-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            id="login-submit-btn"
            className="btn btn--primary btn--full"
            disabled={loading || !apiKey.trim()}
          >
            {loading ? (
              <><span className="spinner" aria-hidden="true" />{t('loading')}</>
            ) : (
              <><LogIn size={18} />{t('loginButton')}</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
