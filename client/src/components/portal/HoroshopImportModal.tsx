import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { horoshopApi, syncApi } from '@/api/client';
import { X, Download, RefreshCw } from 'lucide-react';
import type {
  ImportMode,
  ImportStats,
  HoroshopImportModalProps,
} from './import';
import {
  ImportModeSelector,
  ImportRiskConfirm,
  ImportFieldToggles,
  ImportProgressScreen,
  ImportCompletedScreen,
  ImportErrorScreen,
} from './import';
import { SYNC_MODAL_STATUS, type SyncModalStatus } from './common';

export function HoroshopImportModal({
  isOpen,
  onClose,
  tenantId,
  onImportFinished,
}: HoroshopImportModalProps) {
  const { t, language } = useLanguage();

  const [mode, setMode] = useState<ImportMode>('only_new');
  const [updatePrices, setUpdatePrices] = useState(true);
  const [updateStock, setUpdateStock] = useState(true);
  const [updateImages, setUpdateImages] = useState(true);
  const [createBackup, setCreateBackup] = useState(true);
  const [riskAccepted, setRiskAccepted] = useState(false);

  const [status, setStatus] = useState<SyncModalStatus>(SYNC_MODAL_STATUS.IDLE);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleReset = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setStatus(SYNC_MODAL_STATUS.IDLE);
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
            setStatus(SYNC_MODAL_STATUS.COMPLETED);
            setProgress(100);
            if (job.result) {
              setStats(job.result);
            }
            onImportFinished?.();
          } else if (job.state === 'failed') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setStatus(SYNC_MODAL_STATUS.ERROR);
            setErrorMessage(job.error || 'Ошибка при выполнении фоновой задачи импорта');
          }
        } catch (pollErr: any) {
          console.error('Failed to poll job status:', pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setStatus(SYNC_MODAL_STATUS.ERROR);
      setErrorMessage(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Ошибка запуска импорта каталога',
      );
    }
  };

  const isStartDisabled =
    status === SYNC_MODAL_STATUS.RUNNING || (mode === 'overwrite' && !riskAccepted);

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
          {status !== SYNC_MODAL_STATUS.RUNNING && (
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
          {status === SYNC_MODAL_STATUS.IDLE && (
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

          {status === SYNC_MODAL_STATUS.RUNNING && <ImportProgressScreen progress={progress} />}

          {status === SYNC_MODAL_STATUS.COMPLETED && <ImportCompletedScreen stats={stats} />}

          {status === SYNC_MODAL_STATUS.ERROR && <ImportErrorScreen errorMessage={errorMessage} />}
        </div>

        {/* Modal Footer */}
        {status === SYNC_MODAL_STATUS.IDLE && (
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

        {status === SYNC_MODAL_STATUS.COMPLETED && (
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

        {status === SYNC_MODAL_STATUS.ERROR && (
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
