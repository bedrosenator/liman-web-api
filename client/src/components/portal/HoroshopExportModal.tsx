import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { horoshopApi, syncApi } from '@/api/client';
import { X, Upload, RefreshCw } from 'lucide-react';
import type {
  ExportMode,
  ExportCategory,
  ExportStats,
  HoroshopExportModalProps,
} from './export';
import {
  ExportModeSelector,
  ExportFieldToggles,
  ExportAdvancedSettings,
  ExportProgressScreen,
  ExportCompletedScreen,
  ExportErrorScreen,
} from './export';

export function HoroshopExportModal({
  isOpen,
  onClose,
  tenantId,
  onExportFinished,
}: HoroshopExportModalProps) {
  const { t, language } = useLanguage();

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

  // Reset modal state and fetch Horoshop categories every time modal is opened
  useEffect(() => {
    if (isOpen) {
      handleReset();
      setLoadingCategories(true);
      horoshopApi
        .getExportCategories(tenantId)
        .then((res) => {
          if (res.data?.categories) {
            setCategoriesList(res.data.categories);
          }
        })
        .catch((err) => {
          console.warn('Failed to load Horoshop categories:', err);
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
      const res = await horoshopApi.exportCatalog(tenantId, {
        mode,
        exportPrices,
        exportStock,
        exportDescriptions,
        exportImages,
        exportCategories,
        defaultCategoryPath: defaultCategoryPath || undefined,
        defaultBrand: defaultBrand?.trim() || undefined,
        currency: currency?.trim() || 'UAH',
        baseUrl: window.location.origin,
        limit: limit ? Number(limit) : undefined,
      });

      const jobId = res.data.jobId;

      pollTimerRef.current = setInterval(async () => {
        try {
          const statusRes = await syncApi.getJobStatus('export-horoshop-catalog', jobId);
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
            setErrorMessage(job.error || 'Ошибка выполнения задачи экспорта');
          }
        } catch (pollErr: any) {
          console.error('Failed to poll export job status:', pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Ошибка запуска экспорта каталога',
      );
    }
  };

  return (
    <div className="modal-overlay" id="horoshop-export-modal-overlay" role="dialog" aria-modal="true">
      <div
        className="modal-content modal-content--export"
        id="horoshop-export-modal"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <Upload size={20} className="text-emerald" />
            <h2 className="modal-title">
              {language === 'uk' ? 'Прямий експорт каталогу в Хорошоп' : 'Прямой экспорт каталога в Хорошоп'}
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
                exportPrices={exportPrices}
                setExportPrices={setExportPrices}
                exportStock={exportStock}
                setExportStock={setExportStock}
                exportCategories={exportCategories}
                setExportCategories={setExportCategories}
                exportImages={exportImages}
                setExportImages={setExportImages}
                exportDescriptions={exportDescriptions}
                setExportDescriptions={setExportDescriptions}
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

          {status === 'completed' && <ExportCompletedScreen stats={stats} />}

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
              id="btn-start-export-modal"
              onClick={handleStartExport}
            >
              <Upload size={16} />
              <span>{language === 'uk' ? 'Почати експорт' : 'Начать экспорт'}</span>
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              id="btn-close-export-modal"
              onClick={handleClose}
            >
              {t('close')}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm gap-1.5"
              id="btn-new-export-modal"
              onClick={handleReset}
            >
              <RefreshCw size={14} />
              <span>{language === 'uk' ? 'Нова вигрузка' : 'Новая выгрузка'}</span>
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
              <span>{language === 'uk' ? 'Спробувати знову' : 'Попробовать снова'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
