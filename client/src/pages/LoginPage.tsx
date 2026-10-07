import React, { useState, useId, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Eye, EyeOff, Zap, AlertCircle } from 'lucide-react';
import { useAuth, type AuthRole } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { authApi } from '@/api/client';

const ROLE_SUPERADMIN: AuthRole = 'superadmin';
const ROLE_TENANT: AuthRole = 'tenant';

/**
 * Экран авторизации.
 * Единая форма входа по паролю или API-ключу с автоопределением роли и редиректом.
 */
export function LoginPage() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [apiKey, setApiKey] = useState(() => searchParams.get('token') || '');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = searchParams.get('reason');
  const passwordInputId = useId();

  // Автоматический вход при переходе по прямой ссылке с ?token=...
  useEffect(() => {
    const token = searchParams.get('token');
    if (token && token.trim()) {
      handleAuthenticate(token.trim());
    }
  }, []);

  const handleAuthenticate = async (keyToVerify: string) => {
    if (!keyToVerify.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await authApi.login(keyToVerify.trim());

      login(
        keyToVerify.trim(),
        response.role,
        response.role === ROLE_TENANT ? response.tenantId : undefined,
      );

      if (response.role === ROLE_SUPERADMIN) {
        navigate('/superadmin');
      } else if (response.role === ROLE_TENANT && response.tenantId) {
        navigate(`/portal/${response.tenantId}`);
      } else {
        navigate('/');
      }
    } catch (err: unknown) {
      const errorObj = err as {
        response?: { data?: { message?: string } };
      };
      const apiMessage = errorObj?.response?.data?.message;
      setError(apiMessage || t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAuthenticate(apiKey);
  };

  return (
    <div className="login-page" id="login-page">
      {/* Animated background orbs */}
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

        {/* Reason alert (session expired / access denied) */}
        {reason && (
          <div className="alert alert--warning" role="alert">
            <AlertCircle size={16} />
            <span>
              {reason === 'session_expired'
                ? t('loginSessionExpired')
                : t('loginAccessDenied')}
            </span>
          </div>
        )}

        {/* Single login form */}
        <form className="login-card__form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor={passwordInputId} className="form-label">
              {t('enterApiKey')}
            </label>
            <div className="form-input-wrap">
              <input
                id={passwordInputId}
                type={showKey ? 'text' : 'password'}
                className="form-input form-input--with-btn"
                placeholder={t('apiKeyPlaceholder')}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (error) setError(null);
                }}
                required
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                id="toggle-key-visibility"
                className="form-input-reveal"
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? 'Hide password' : 'Show password'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <p className="login-hint">{t('masterKeyHint')}</p>

          {/* Error alert */}
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
              <>
                <span className="spinner" aria-hidden="true" />
                {t('loading')}
              </>
            ) : (
              <>
                <LogIn size={18} />
                {t('loginButton')}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
