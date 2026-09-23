import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { promApi, syncApi } from '@/api/client';
import { X, Download, RefreshCw } from 'lucide-react';
import type {
  ImportMode,
  ImportStats,
} from './import';
import {
  ImportModeSelector,
  ImportRiskConfirm,
  ImportFieldToggles,
  ImportProgressScreen,
  ImportCompletedScreen,
  ImportErrorScreen,
} from './import';

export interface PromImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onImportFinished?: () => void;
}

export function PromImportModal({
  isOpen,
  onClose,
  tenantId,
  onImportFinished,
}: PromImportModalProps) {
  const { t, language } = useLanguage();

  const [mode, setMode] = useState<ImportMode>('only_new');
  const [updatePrices, setUpdatePrices] = useState(true);
  const [updateStock, setUpdateStock] = useState(true);
  const [updateImages, setUpdateImages] = useState(true);
  const [createBackup, setCreateBackup] = useState(true);
  const [riskAccepted, setRiskAccepted] = useState(false);

  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);

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

  // Reset modal state every time it is opened
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
      const res = await promApi.importCatalog(tenantId, {
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
          const statusRes = await syncApi.getJobStatus('import-prom-catalog', jobId);
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
            setErrorMessage(job.error || 'Ошибка при выполнении фоновой задачи импорта из Prom.ua');
          }
        } catch (pollErr: any) {
          console.error('Failed to poll Prom import job status:', pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Ошибка запуска импорта каталога из Prom.ua',
      );
    }
  };

  const isStartDisabled =
    status === 'running' || (mode === 'overwrite' && !riskAccepted);

  return (
    <div className="modal-overlay" id="prom-import-modal-overlay" role="dialog" aria-modal="true">
      <div
        className="modal-content modal-content--export"
        id="prom-import-modal"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <Download size={20} className="text-indigo" />
            <h2 className="modal-title">
              {language === 'uk'
                ? 'Імпорт каталогу з Prom.ua'
                : 'Импорт каталога из Prom.ua'}
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
              <ImportModeSelector
                mode={mode}
                onModeChange={(newMode) => {
                  setMode(newMode);
                  if (newMode !== 'overwrite') setRiskAccepted(false);
                }}
              />

              {mode === 'overwrite' && (
                <ImportRiskConfirm
                  riskAccepted={riskAccepted}
                  onRiskChange={setRiskAccepted}
                />
              )}

              <ImportFieldToggles
                updatePrices={updatePrices}
                setUpdatePrices={setUpdatePrices}
                updateStock={updateStock}
                setUpdateStock={setUpdateStock}
                updateImages={updateImages}
                setUpdateImages={setUpdateImages}
                createBackup={createBackup}
                setCreateBackup={setCreateBackup}
              />
            </div>
          )}

          {status === 'running' && <ImportProgressScreen progress={progress} />}

          {status === 'completed' && <ImportCompletedScreen stats={stats} />}

          {status === 'error' && <ImportErrorScreen errorMessage={errorMessage} />}
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
              id="btn-start-prom-import-modal"
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
              id="btn-close-prom-import-modal"
              onClick={handleClose}
            >
              {language === 'uk' ? 'Закрити' : 'Закрыть'}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm gap-1.5"
              id="btn-new-prom-import-modal"
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
