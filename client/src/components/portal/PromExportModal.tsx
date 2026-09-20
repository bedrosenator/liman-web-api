import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { promApi, syncApi } from '@/api/client';
import { X, Upload, RefreshCw } from 'lucide-react';
import type {
  ExportMode,
  ExportCategory,
  ExportStats,
} from './export';
import {
  ExportModeSelector,
  ExportFieldToggles,
  ExportProgressScreen,
  ExportCompletedScreen,
  ExportErrorScreen,
} from './export';

export interface PromExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onExportFinished?: () => void;
}

export function PromExportModal({
  isOpen,
  onClose,
  tenantId,
  onExportFinished,
}: PromExportModalProps) {
  const { t, language } = useLanguage();

  const [mode, setMode] = useState<ExportMode>('full_overwrite');
  const [exportPrices, setExportPrices] = useState(true);
  const [exportStock, setExportStock] = useState(true);
  const [exportDescriptions, setExportDescriptions] = useState(true);
  const [exportImages, setExportImages] = useState(true);
  const [exportCategories, setExportCategories] = useState(true);
  const [defaultGroupId, setDefaultGroupId] = useState<number | ''>('');
  const [categoriesList, setCategoriesList] = useState<ExportCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
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
            const formatted: ExportCategory[] = res.data.categories.map((c) => ({
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
        defaultGroupId: defaultGroupId ? Number(defaultGroupId) : undefined,
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
            setErrorMessage(job.error || 'Ошибка выполнения задачи экспорта в Prom.ua');
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
          'Ошибка запуска экспорта каталога в Prom.ua',
      );
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div
        className="modal-content max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
        id="prom-export-modal"
      >
        {/* Header */}
        <div className="modal-header flex items-center justify-between border-b border-subtle pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-primary">
                {language === 'uk'
                  ? 'Експорт товарів з Limansoft у Prom.ua'
                  : 'Прямой экспорт товаров из Limansoft в Prom.ua'}
              </h3>
              <p className="text-xs text-muted">
                {language === 'uk'
                  ? 'Фонове вивантаження каталогу, залишків та цін через чергу BullMQ'
                  : 'Фоновая выгрузка каталога, остатков и цен через очередь BullMQ'}
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
              {/* 1. Режим экспорта */}
              <ExportModeSelector mode={mode} onChange={setMode} />

              {/* 2. Состав полей для выгрузки */}
              <ExportFieldToggles
                exportPrices={exportPrices}
                setExportPrices={setExportPrices}
                exportStock={exportStock}
                setExportStock={setExportStock}
                exportDescriptions={exportDescriptions}
                setExportDescriptions={setExportDescriptions}
                exportImages={exportImages}
                setExportImages={setExportImages}
                exportCategories={exportCategories}
                setExportCategories={setExportCategories}
              />

              {/* 3. Выбор группы Prom.ua и валюты */}
              <div className="p-3 bg-surface rounded-lg border border-subtle space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">
                    {language === 'uk'
                      ? 'Цільова група товарів Prom.ua'
                      : 'Целевая группа товаров Prom.ua'}
                  </span>
                  {loadingCategories && (
                    <span className="text-[11px] text-muted flex items-center gap-1">
                      <RefreshCw size={11} className="spinner" />
                      {language === 'uk' ? 'Завантаження груп...' : 'Загрузка групп...'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted">
                      {language === 'uk' ? 'Група за замовчуванням' : 'Группа по умолчанию'}
                    </label>
                    <select
                      className="input text-xs w-full"
                      value={defaultGroupId}
                      onChange={(e) => setDefaultGroupId(e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">
                        {language === 'uk'
                          ? '— Автоматично за категорією Liman —'
                          : '— Автоматически по категории Liman —'}
                      </option>
                      {categoriesList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} (ID: {c.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted">
                      {language === 'uk' ? 'Валюта цін' : 'Валюта цен'}
                    </label>
                    <input
                      type="text"
                      className="input text-xs w-full uppercase"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                      placeholder="UAH"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-muted">
                    {language === 'uk' ? 'Ліміт товарів (опціонально)' : 'Лимит товаров (для теста)'}
                  </label>
                  <input
                    type="number"
                    className="input text-xs w-full"
                    placeholder="Наприклад: 50"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value ? Number(e.target.value) : '')}
                  />
                </div>
              </div>
            </>
          )}

          {status === 'running' && (
            <ExportProgressScreen
              progress={progress}
              onCancel={handleClose}
            />
          )}

          {status === 'completed' && stats && (
            <ExportCompletedScreen stats={stats} />
          )}

          {status === 'error' && errorMessage && (
            <ExportErrorScreen errorMessage={errorMessage} />
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
                onClick={handleStartExport}
                id="btn-confirm-prom-export"
              >
                <Upload size={16} />
                <span>
                  {language === 'uk' ? 'Почати експорт у Prom' : 'Запустить экспорт в Prom'}
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
