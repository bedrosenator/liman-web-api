import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { promApi, syncApi } from '@/api/client';
import { X, Upload, RefreshCw } from 'lucide-react';
import type {
  ExportMode,
  ExportCategory,
  ExportStats,
} from '../export';
import {
  ExportModeSelector,
  ExportFieldToggles,
  ExportAdvancedSettings,
  ExportProgressScreen,
  ExportCompletedScreen,
  ExportErrorScreen,
} from '../export';

export interface PromExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  feedUrl?: string;
  onExportFinished?: () => void;
}

export function PromExportModal({
  isOpen,
  onClose,
  tenantId,
  feedUrl,
  onExportFinished,
}: PromExportModalProps) {
  const { t } = useLanguage();

  const [mode, setMode] = useState<ExportMode>('full_overwrite');
  const [exportPrices, setExportPrices] = useState(true);
  const [exportStock, setExportStock] = useState(true);
  const [exportDescriptions, setExportDescriptions] = useState(true);
  const [exportImages, setExportImages] = useState(true);
  const [exportCategories, setExportCategories] = useState(true);
  const [defaultCategoryPath, setDefaultCategoryPath] = useState('');
  const [categoriesList, setCategoriesList] = useState<ExportCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [defaultBrand, setDefaultBrand] = useState('');
  const [currency, setCurrency] = useState('UAH');
  const [limit, setLimit] = useState<number | ''>('');

  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<ExportStats | null>(null);

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
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      handleReset();
      setLoadingCategories(true);
      promApi
        .getExportCategories(tenantId)
        .then((res) => {
          if (res.data?.categories) {
            const formatted: ExportCategory[] = res.data.categories.map((c: any) => ({
              id: c.id,
              title: c.name,
              fullPath: c.name,
            }));
            setCategoriesList(formatted);
          }
        })
        .catch((err) => {
          console.warn('Failed to load Prom categories:', err);
        })
        .finally(() => {
          setLoadingCategories(false);
        });
    }
  }, [isOpen, tenantId]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setStatus('running');
    setProgress(0);
    setErrorMessage(null);
    setStats(null);

    try {
      const res = await promApi.exportCatalog(tenantId, {
        mode,
        exportPrices,
        exportStock,
        exportDescriptions,
        exportImages,
        exportCategories,
        defaultGroupId: defaultCategoryPath ? Number(defaultCategoryPath) : undefined,
        currency: currency?.trim() || 'UAH',
        baseUrl: window.location.origin,
        limit: limit ? Number(limit) : undefined,
      });

      const jobId = res.data.jobId;

      pollTimerRef.current = setInterval(async () => {
        try {
          const statusRes = await syncApi.getJobStatus('export-prom-catalog', jobId);
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
            onExportFinished?.();
          } else if (job.state === 'failed') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setStatus('error');
            setErrorMessage(job.error || 'Ошибка при выполнении фоновой задачи экспорта в Prom.ua');
          }
        } catch (pollErr: any) {
          console.error('Failed to poll Prom export job status:', pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Ошибка запуска экспорта каталога в Prom.ua',
      );
    }
  };

  return (
    <div className="modal-overlay" id="prom-export-modal-overlay" role="dialog" aria-modal="true">
      <div
        className="modal-content modal-content--export"
        id="prom-export-modal"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <Upload size={20} className="text-emerald" />
            <h2 className="modal-title">
              {t('promExportModalTitle')}
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
              <ExportModeSelector mode={mode} onModeChange={setMode} />

              <ExportFieldToggles
                exportPrices={exportPrices} setExportPrices={setExportPrices}
                exportStock={exportStock} setExportStock={setExportStock}
                exportCategories={exportCategories} setExportCategories={setExportCategories}
                exportImages={exportImages} setExportImages={setExportImages}
                exportDescriptions={exportDescriptions} setExportDescriptions={setExportDescriptions}
              />

              <ExportAdvancedSettings
                defaultCategoryPath={defaultCategoryPath}
                setDefaultCategoryPath={setDefaultCategoryPath}
                categoriesList={categoriesList}
                loadingCategories={loadingCategories}
                defaultBrand={defaultBrand}
                setDefaultBrand={setDefaultBrand}
                currency={currency}
                setCurrency={setCurrency}
                limit={limit}
                setLimit={setLimit}
              />
            </div>
          )}

          {status === 'running' && <ExportProgressScreen progress={progress} />}
          {status === 'completed' && (
            <ExportCompletedScreen stats={stats} platform="prom" feedUrl={feedUrl} />
          )}
          {status === 'error' && <ExportErrorScreen errorMessage={errorMessage} />}
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
              id="btn-start-prom-export-modal"
              onClick={handleStartExport}
            >
              <Upload size={16} />
              <span>{t('startExport')}</span>
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              id="btn-close-prom-export-modal"
              onClick={handleClose}
            >
              {t('close')}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm gap-1.5"
              id="btn-new-prom-export-modal"
              onClick={handleReset}
            >
              <RefreshCw size={14} />
              <span>{t('newExport')}</span>
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
              {t('close')}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm gap-1.5"
              onClick={handleReset}
            >
              <RefreshCw size={14} />
              <span>{t('retryAgain')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
