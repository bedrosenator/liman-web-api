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
    <div className="modal-overlay" id="horoshop-import-modal-overlay">
      <div
        className="modal modal--md max-w-xl w-full bg-elevated border border-subtle rounded-xl p-6 shadow-2xl"
        id="horoshop-import-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-subtle mb-4">
          <div className="flex items-center gap-2">
            <Download size={20} className="text-indigo" />
            <h2 className="text-lg font-bold text-primary">
              {t('importFromHoroshop')}
            </h2>
          </div>
          {status !== 'running' && (
            <button
              type="button"
              className="text-muted hover:text-primary transition-colors p-1"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        {status === 'idle' && (
          <div className="space-y-4">
            {/* Режим синхронизации */}
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                {t('importMode')}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Режим 1: Только новинки */}
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    mode === 'only_new'
                      ? 'border-indigo bg-indigo/10 shadow-sm'
                      : 'border-subtle bg-canvas hover:border-muted'
                  }`}
                  onClick={() => {
                    setMode('only_new');
                    setRiskAccepted(false);
                  }}
                  id="mode-only-new"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={18} className="text-emerald" />
                    <span className="text-sm font-semibold text-primary">
                      {t('onlyNewItems')}
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    {t('onlyNewItemsDesc')}
                  </p>
                </div>

                {/* Режим 2: Перезапись */}
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    mode === 'overwrite'
                      ? 'border-rose bg-rose/10 shadow-sm'
                      : 'border-subtle bg-canvas hover:border-muted'
                  }`}
                  onClick={() => setMode('overwrite')}
                  id="mode-overwrite"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={18} className="text-rose" />
                    <span className="text-sm font-semibold text-primary">
                      {t('overwriteItems')}
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    {t('overwriteItemsDesc')}
                  </p>
                </div>
              </div>
            </div>

            {/* Защитный барьер при режиме перезаписи */}
            {mode === 'overwrite' && (
              <div
                className="p-4 rounded-lg bg-rose/10 border border-rose/30 space-y-3"
                id="overwrite-warning-box"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="text-rose flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose font-medium leading-relaxed">
                    {t('overwriteConfirm')}
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={riskAccepted}
                    onChange={(e) => setRiskAccepted(e.target.checked)}
                    className="checkbox"
                    id="chk-risk-accepted"
                  />
                  <span className="text-xs font-semibold text-rose">
                    {t('overwriteCheckbox')}
                  </span>
                </label>
              </div>
            )}

            {/* Тонкие настройки полей */}
            <div className="space-y-2 pt-2 border-t border-subtle">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                {language === 'uk' ? 'Параметри імпорту' : 'Параметры импорта'}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 p-2 rounded bg-canvas border border-subtle cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updatePrices}
                    onChange={(e) => setUpdatePrices(e.target.checked)}
                    className="checkbox"
                  />
                  <DollarSign size={14} className="text-indigo" />
                  <span>{language === 'uk' ? 'Роздрібні ціни (cena2)' : 'Розничные цены (cena2)'}</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded bg-canvas border border-subtle cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updateStock}
                    onChange={(e) => setUpdateStock(e.target.checked)}
                    className="checkbox"
                  />
                  <Package size={14} className="text-emerald" />
                  <span>{language === 'uk' ? 'Складські залишки (skl_k)' : 'Складские остатки (skl_k)'}</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded bg-canvas border border-subtle cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updateImages}
                    onChange={(e) => setUpdateImages(e.target.checked)}
                    className="checkbox"
                  />
                  <ImageIcon size={14} className="text-sky" />
                  <span>{language === 'uk' ? 'Фотографії (namedesc)' : 'Фотографии (namedesc)'}</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded bg-canvas border border-subtle cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createBackup}
                    onChange={(e) => setCreateBackup(e.target.checked)}
                    className="checkbox"
                  />
                  <Database size={14} className="text-amber" />
                  <span className="truncate">{t('autoBackupBeforeSync')}</span>
                </label>
              </div>
            </div>

            {/* Action button */}
            <div className="pt-3">
              <button
                type="button"
                className="btn btn--primary w-full justify-center py-2.5"
                id="btn-start-catalog-import"
                onClick={handleStartImport}
                disabled={isStartDisabled}
              >
                <Download size={18} />
                <span>{t('startImport')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Running state with Live Progress Bar */}
        {status === 'running' && (
          <div className="py-8 text-center space-y-4" id="import-running-box">
            <Loader2 size={36} className="spinner text-indigo mx-auto" />
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
              <div className="w-full bg-subtle h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Completed state with Counters Report */}
        {status === 'completed' && (
          <div className="py-6 text-center space-y-4" id="import-completed-box">
            <CheckCircle2 size={42} className="text-emerald mx-auto" />
            <div>
              <h3 className="text-base font-bold text-primary">
                {language === 'uk' ? 'Імпорт каталогу успішно завершено!' : 'Импорт каталога успешно завершен!'}
              </h3>
              <p className="text-xs text-secondary mt-1">
                {language === 'uk'
                  ? 'Товари з магазину Хорошоп синхронізовані в MariaDB Limansoft.'
                  : 'Товары из магазина Хорошоп синхронизированы в MariaDB Limansoft.'}
              </p>
            </div>

            {stats && (
              <div className="grid grid-cols-4 gap-2 bg-canvas p-3 rounded-lg border border-subtle text-center">
                <div>
                  <div className="text-lg font-bold text-primary">{stats.totalFetched ?? 0}</div>
                  <div className="text-[11px] text-muted">{t('importProgress')}</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald">{stats.created ?? 0}</div>
                  <div className="text-[11px] text-muted">{t('importCreated')}</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-indigo">{stats.updated ?? 0}</div>
                  <div className="text-[11px] text-muted">{t('importUpdated')}</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber">{stats.skipped ?? 0}</div>
                  <div className="text-[11px] text-muted">
                    {language === 'uk' ? 'Пропущено' : 'Пропущено'}
                  </div>
                </div>
              </div>
            )}

            {stats?.backupId && (
              <div className="text-[11px] text-muted font-mono bg-canvas p-2 rounded border border-subtle">
                🛡️ Бэкап: {stats.backupId}
              </div>
            )}

            <button
              type="button"
              className="btn btn--secondary w-full justify-center"
              onClick={onClose}
            >
              {language === 'uk' ? 'Закрити' : 'Закрыть'}
            </button>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="py-6 text-center space-y-4" id="import-error-box">
            <AlertCircle size={40} className="text-rose mx-auto" />
            <div>
              <h3 className="text-base font-bold text-rose">
                {language === 'uk' ? 'Помилка імпорту каталогу' : 'Ошибка импорта каталога'}
              </h3>
              <p className="text-xs text-secondary mt-1">{errorMessage}</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn--secondary flex-1 justify-center"
                onClick={() => setStatus('idle')}
              >
                {language === 'uk' ? 'Спробувати знову' : 'Попробовать снова'}
              </button>
              <button
                type="button"
                className="btn btn--secondary flex-1 justify-center"
                onClick={onClose}
              >
                {language === 'uk' ? 'Закрити' : 'Закрыть'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
