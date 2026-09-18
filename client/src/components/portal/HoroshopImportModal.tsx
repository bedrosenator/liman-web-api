import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { horoshopApi, syncApi } from '@/api/client';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  Image as ImageIcon,
  DollarSign,
  Package,
  Check,
  RefreshCw,
  Layers,
  Sparkles,
} from 'lucide-react';

interface HoroshopImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onImportFinished?: () => void;
}

export function HoroshopImportModal({
  isOpen,
  onClose,
  tenantId,
  onImportFinished,
}: HoroshopImportModalProps) {
  const { t, language } = useLanguage();

  const [mode, setMode] = useState<'only_new' | 'overwrite'>('only_new');
  const [updatePrices, setUpdatePrices] = useState(true);
  const [updateStock, setUpdateStock] = useState(true);
  const [updateImages, setUpdateImages] = useState(true);
  const [createBackup, setCreateBackup] = useState(true);
  const [riskAccepted, setRiskAccepted] = useState(false);

  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalFetched?: number;
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
    backupId?: string;
  } | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleReset = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setStatus('idle');
    setProgress(0);
    setErrorMessage(null);
    setStats(null);
    setRiskAccepted(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Reset modal state every time it is opened or closed
  useEffect(() => {
    if (isOpen) {
      handleReset();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleStartImport = async () => {
    setStatus('running');
    setProgress(0);
    setErrorMessage(null);
    setStats(null);

    try {
      const res = await horoshopApi.importCatalog(tenantId, {
        mode,
        updatePrices,
        updateStock,
        updateImages,
        createBackup,
      });

      const jobId = res.data.jobId;

      // Опрос прогресса задачи BullMQ
      pollTimerRef.current = setInterval(async () => {
        try {
          const statusRes = await syncApi.getJobStatus('import-horoshop-catalog', jobId);
          const job = statusRes.data;

          if (typeof job.progress === 'number') {
            setProgress(job.progress);
          }

          if (job.state === 'completed') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setStatus('completed');
            setProgress(100);
            if (job.result) {
              setStats(job.result);
            }
            onImportFinished?.();
          } else if (job.state === 'failed') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setStatus('error');
            setErrorMessage(job.error || 'Ошибка при выполнении фоновой задачи импорта');
          }
        } catch (pollErr: any) {
          console.error('Failed to poll job status:', pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Ошибка запуска импорта каталога',
      );
    }
  };

  const isStartDisabled =
    status === 'running' || (mode === 'overwrite' && !riskAccepted);

  return (
    <div className="modal-overlay" id="horoshop-import-modal-overlay" role="dialog" aria-modal="true">
      <div
        className="modal-content modal-content--export"
        id="horoshop-import-modal"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <Download size={20} className="text-indigo" />
            <h2 className="modal-title">
              {t('importFromHoroshop')}
            </h2>
          </div>
          {status !== 'running' && (
            <button
              type="button"
              className="btn-icon"
              onClick={handleClose}
              aria-label={t('close')}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {status === 'idle' && (
            <div className="space-y-4">
              {/* Режим синхронизации */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                  {t('importMode')}
                </label>

                <div className="mode-cards-grid mode-cards-grid--2">
                  {/* Режим 1: Только новинки */}
                  <label
                    htmlFor="radio-mode-only-new"
                    className={`mode-card mode-card--indigo ${
                      mode === 'only_new' ? 'mode-card--active' : ''
                    }`}
                    id="mode-only-new"
                    onClick={() => {
                      setMode('only_new');
                      setRiskAccepted(false);
                    }}
                  >
                    <input
                      type="radio"
                      id="radio-mode-only-new"
                      name="importMode"
                      value="only_new"
                      checked={mode === 'only_new'}
                      onChange={() => {
                        setMode('only_new');
                        setRiskAccepted(false);
                      }}
                      className="sr-only"
                    />
                    <div className="mode-card__header">
                      <div className="mode-card__title-wrap">
                        <ShieldCheck size={18} className="text-emerald" />
                        <span className="mode-card__title">
                          {t('onlyNewItems')}
                        </span>
                      </div>
                      <div className="mode-card__radio" aria-hidden="true">
                        {mode === 'only_new' ? (
                          <Check size={12} strokeWidth={3} className="text-white" />
                        ) : null}
                      </div>
                    </div>
                    <p className="mode-card__desc">
                      {t('onlyNewItemsDesc')}
                    </p>
                  </label>

                  {/* Режим 2: Перезапись */}
                  <label
                    htmlFor="radio-mode-overwrite"
                    className={`mode-card mode-card--rose ${
                      mode === 'overwrite' ? 'mode-card--active' : ''
                    }`}
                    id="mode-overwrite"
                    onClick={() => setMode('overwrite')}
                  >
                    <input
                      type="radio"
                      id="radio-mode-overwrite"
                      name="importMode"
                      value="overwrite"
                      checked={mode === 'overwrite'}
                      onChange={() => setMode('overwrite')}
                      className="sr-only"
                    />
                    <div className="mode-card__header">
                      <div className="mode-card__title-wrap">
                        <AlertTriangle size={18} className="text-rose" />
                        <span className="mode-card__title">
                          {t('overwriteItems')}
                        </span>
                      </div>
                      <div className="mode-card__radio" aria-hidden="true">
                        {mode === 'overwrite' ? (
                          <Check size={12} strokeWidth={3} className="text-white" />
                        ) : null}
                      </div>
                    </div>
                    <p className="mode-card__desc">
                      {t('overwriteItemsDesc')}
                    </p>
                  </label>
                </div>
              </div>

              {/* Защитный барьер при режиме перезаписи */}
              {mode === 'overwrite' && (
                <div
                  className="warning-box--rose space-y-3"
                  id="overwrite-warning-box"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={18} className="text-rose flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-rose font-medium leading-relaxed">
                      {t('overwriteConfirm')}
                    </p>
                  </div>

                  <label className="checkbox-item" htmlFor="chk-risk-accepted">
                    <input
                      type="checkbox"
                      checked={riskAccepted}
                      onChange={(e) => setRiskAccepted(e.target.checked)}
                      id="chk-risk-accepted"
                    />
                    <span className="text-xs font-semibold text-rose">
                      {t('overwriteCheckbox')}
                    </span>
                  </label>
                </div>
              )}

              {/* Тонкие настройки полей */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                  {language === 'uk' ? 'Параметри імпорту' : 'Параметры импорта'}
                </label>

                <div className="checkbox-grid">
                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={updatePrices}
                      onChange={(e) => setUpdatePrices(e.target.checked)}
                    />
                    <DollarSign size={14} className="text-indigo" />
                    <span>{language === 'uk' ? 'Роздрібні ціни (cena2)' : 'Розничные цены (cena2)'}</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={updateStock}
                      onChange={(e) => setUpdateStock(e.target.checked)}
                    />
                    <Package size={14} className="text-emerald" />
                    <span>{language === 'uk' ? 'Складські залишки (skl_k)' : 'Складские остатки (skl_k)'}</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={updateImages}
                      onChange={(e) => setUpdateImages(e.target.checked)}
                    />
                    <ImageIcon size={14} className="text-sky" />
                    <span>{language === 'uk' ? 'Фотографії (namedesc)' : 'Фотографии (namedesc)'}</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={createBackup}
                      onChange={(e) => setCreateBackup(e.target.checked)}
                    />
                    <Database size={14} className="text-amber" />
                    <span className="truncate">{t('autoBackupBeforeSync')}</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Running state with Live Progress Bar */}
          {status === 'running' && (
            <div className="py-8 text-center space-y-4" id="import-running-box">
              <Loader2 size={40} className="spinner text-indigo mx-auto" />
              <div>
                <h3 className="text-base font-semibold text-primary">{t('importRunning')}</h3>
                <p className="text-xs text-secondary mt-1">
                  {language === 'uk'
                    ? 'Фонова черга BullMQ безпечно обробляє товари каталогу без блокування сервера.'
                    : 'Фоновая очередь BullMQ безопасно обрабатывает товары каталога без блокировки сервера.'}
                </p>
              </div>

              <div className="space-y-1.5 max-w-md mx-auto">
                <div className="flex justify-between text-xs text-muted font-mono">
                  <span>{t('importProgress')}</span>
                  <span>{progress}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill progress-fill--indigo"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Completed state with Counters Report */}
          {status === 'completed' && (
            <div className="py-2 space-y-5 text-center" id="import-completed-box">
              <div className="success-badge-glow">
                <CheckCircle2 size={36} className="text-emerald" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-primary">
                  {language === 'uk' ? 'Імпорт каталогу успішно завершено!' : 'Импорт каталога успешно завершен!'}
                </h3>
                <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
                  {language === 'uk'
                    ? 'Товари з магазину Хорошоп синхронізовані в MariaDB Limansoft.'
                    : 'Товары из магазина Хорошоп синхронизированы в MariaDB Limansoft.'}
                </p>
              </div>

              {stats && (
                <div className="stat-grid">
                  <div className="stat-box">
                    <div className="stat-box__header">
                      <Layers size={13} className="text-indigo" />
                      <span className="stat-box__label">{t('importProgress')}</span>
                    </div>
                    <div className="stat-box__value">{stats.totalFetched ?? 0}</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-box__header">
                      <Sparkles size={13} className="text-emerald" />
                      <span className="stat-box__label">{t('importCreated')}</span>
                    </div>
                    <div className="stat-box__value text-emerald">{stats.created ?? 0}</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-box__header">
                      <RefreshCw size={13} className="text-sky" />
                      <span className="stat-box__label">{t('importUpdated')}</span>
                    </div>
                    <div className="stat-box__value text-sky">{stats.updated ?? 0}</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-box__header">
                      <AlertTriangle size={13} className="text-amber" />
                      <span className="stat-box__label">
                        {language === 'uk' ? 'Пропущено' : 'Пропущено'}
                      </span>
                    </div>
                    <div className="stat-box__value text-amber">{stats.skipped ?? 0}</div>
                  </div>
                </div>
              )}

              {stats?.backupId && (
                <div className="duration-pill">
                  <span>🛡️ {language === 'uk' ? 'Бекап:' : 'Бэкап:'} {stats.backupId}</span>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="py-4 space-y-4 text-center" id="import-error-box">
              <div className="w-12 h-12 bg-rose/10 border border-rose/30 rounded-full flex items-center justify-center mx-auto text-rose">
                <AlertCircle size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-primary mb-1">
                  {language === 'uk' ? 'Помилка імпорту каталогу' : 'Ошибка импорта каталога'}
                </h3>
                <p className="text-xs text-rose max-w-sm mx-auto">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {status === 'idle' && (
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleClose}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm gap-1.5"
              id="btn-start-catalog-import"
              onClick={handleStartImport}
              disabled={isStartDisabled}
            >
              <Download size={16} />
              <span>{t('startImport')}</span>
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleClose}
            >
              {language === 'uk' ? 'Закрити' : 'Закрыть'}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm gap-1.5"
              onClick={handleReset}
            >
              <RefreshCw size={14} />
              <span>{language === 'uk' ? 'Новий імпорт' : 'Новый импорт'}</span>
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="modal-footer justify-end">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleClose}
            >
              {language === 'uk' ? 'Закрити' : 'Закрыть'}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm gap-1.5"
              onClick={handleReset}
            >
              <RefreshCw size={14} />
              <span>{language === 'uk' ? 'Спробувати знову' : 'Попробовать снова'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
