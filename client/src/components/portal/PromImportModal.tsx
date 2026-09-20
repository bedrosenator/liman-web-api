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

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div
        className="modal-content max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
        id="prom-import-modal"
      >
        {/* Header */}
        <div className="modal-header flex items-center justify-between border-b border-subtle pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Download size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-primary">
                {language === 'uk'
                  ? 'Імпорт товарів з Prom.ua у Limansoft'
                  : 'Обратный импорт товаров из Prom.ua в Limansoft'}
              </h3>
              <p className="text-xs text-muted">
                {language === 'uk'
                  ? 'Фонове завантаження новинок або каталогу Prom у базу MariaDB'
                  : 'Фоновая загрузка новинок или каталога Prom в базу MariaDB'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm p-1 text-muted hover:text-primary"
            onClick={handleClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body py-4 space-y-6">
          {status === 'idle' && (
            <>
              {/* 1. Режим импорта */}
              <ImportModeSelector mode={mode} onModeChange={setMode} />

              {/* 2. Подтверждение риска при перезаписи */}
              {mode === 'overwrite' && (
                <ImportRiskConfirm
                  riskAccepted={riskAccepted}
                  onRiskChange={setRiskAccepted}
                />
              )}

              {/* 3. Состав полей */}
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
            </>
          )}

          {status === 'running' && (
            <ImportProgressScreen
              progress={progress}
              onCancel={handleClose}
            />
          )}

          {status === 'completed' && stats && (
            <ImportCompletedScreen stats={stats} />
          )}

          {status === 'error' && errorMessage && (
            <ImportErrorScreen errorMessage={errorMessage} />
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer flex items-center justify-end gap-3 border-t border-subtle pt-4">
          {status === 'idle' && (
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleClose}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary gap-1.5"
                disabled={mode === 'overwrite' && !riskAccepted}
                onClick={handleStartImport}
                id="btn-confirm-prom-import"
              >
                <Download size={16} />
                <span>
                  {language === 'uk' ? 'Почати імпорт з Prom' : 'Запустить импорт из Prom'}
                </span>
              </button>
            </>
          )}

          {(status === 'completed' || status === 'error') && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleClose}
            >
              {t('close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
