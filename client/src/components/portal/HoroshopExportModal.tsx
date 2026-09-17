import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { horoshopApi, syncApi } from '@/api/client';
import {
  X,
  Upload,
  Zap,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  Image as ImageIcon,
  DollarSign,
  Package,
  FileText,
  Clock,
  Sparkles,
  RefreshCw,
  Check,
} from 'lucide-react';

interface HoroshopExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onExportFinished?: () => void;
}

export function HoroshopExportModal({
  isOpen,
  onClose,
  tenantId,
  onExportFinished,
}: HoroshopExportModalProps) {
  const { t, language } = useLanguage();

  const [mode, setMode] = useState<'full_overwrite' | 'only_new' | 'update_existing'>('full_overwrite');
  const [exportPrices, setExportPrices] = useState(true);
  const [exportStock, setExportStock] = useState(true);
  const [exportDescriptions, setExportDescriptions] = useState(true);
  const [exportImages, setExportImages] = useState(true);
  const [exportCategories, setExportCategories] = useState(true);
  const [limit, setLimit] = useState<number | ''>('');

  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalFetched?: number;
    totalExported?: number;
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
    durationMs?: number;
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
              {/* Режим выгрузки */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                  {language === 'uk' ? 'Режим вивантаження' : 'Режим выгрузки'}
                </label>

                <div className="mode-cards-grid">
                  {/* Режим 1: Полная выгрузка */}
                  <label
                    htmlFor="radio-mode-full-overwrite"
                    className={`mode-card mode-card--emerald ${
                      mode === 'full_overwrite' ? 'mode-card--active' : ''
                    }`}
                    id="mode-full-overwrite"
                    onClick={() => setMode('full_overwrite')}
                  >
                    <input
                      type="radio"
                      id="radio-mode-full-overwrite"
                      name="exportMode"
                      value="full_overwrite"
                      checked={mode === 'full_overwrite'}
                      onChange={() => setMode('full_overwrite')}
                      className="sr-only"
                    />
                    <div className="mode-card__header">
                      <div className="mode-card__title-wrap">
                        <Zap size={16} className="text-emerald" />
                        <span className="mode-card__title">
                          {language === 'uk' ? 'Всі товари' : 'Все товары'}
                        </span>
                      </div>
                      <div className="mode-card__radio" aria-hidden="true">
                        {mode === 'full_overwrite' ? (
                          <Check size={12} strokeWidth={3} className="text-white" />
                        ) : null}
                      </div>
                    </div>
                    <p className="mode-card__desc">
                      {language === 'uk'
                        ? 'Повне оновлення та експорт всього каталогу'
                        : 'Полное обновление и экспорт всего каталога'}
                    </p>
                  </label>

                  {/* Режим 2: Только новинки */}
                  <label
                    htmlFor="radio-mode-only-new"
                    className={`mode-card mode-card--indigo ${
                      mode === 'only_new' ? 'mode-card--active' : ''
                    }`}
                    id="mode-only-new"
                    onClick={() => setMode('only_new')}
                  >
                    <input
                      type="radio"
                      id="radio-mode-only-new"
                      name="exportMode"
                      value="only_new"
                      checked={mode === 'only_new'}
                      onChange={() => setMode('only_new')}
                      className="sr-only"
                    />
                    <div className="mode-card__header">
                      <div className="mode-card__title-wrap">
                        <Sparkles size={16} className="text-indigo" />
                        <span className="mode-card__title">
                          {language === 'uk' ? 'Тільки новинки' : 'Только новинки'}
                        </span>
                      </div>
                      <div className="mode-card__radio" aria-hidden="true">
                        {mode === 'only_new' ? (
                          <Check size={12} strokeWidth={3} className="text-white" />
                        ) : null}
                      </div>
                    </div>
                    <p className="mode-card__desc">
                      {language === 'uk'
                        ? 'Вивантажити лише нові, ще не створені позиції'
                        : 'Выгрузить только новые, еще не созданные позиции'}
                    </p>
                  </label>

                  {/* Режим 3: Обновление существующих */}
                  <label
                    htmlFor="radio-mode-update-existing"
                    className={`mode-card mode-card--sky ${
                      mode === 'update_existing' ? 'mode-card--active' : ''
                    }`}
                    id="mode-update-existing"
                    onClick={() => setMode('update_existing')}
                  >
                    <input
                      type="radio"
                      id="radio-mode-update-existing"
                      name="exportMode"
                      value="update_existing"
                      checked={mode === 'update_existing'}
                      onChange={() => setMode('update_existing')}
                      className="sr-only"
                    />
                    <div className="mode-card__header">
                      <div className="mode-card__title-wrap">
                        <RefreshCw size={16} className="text-sky" />
                        <span className="mode-card__title">
                          {language === 'uk' ? 'Оновити існуючі' : 'Обновить сущ.'}
                        </span>
                      </div>
                      <div className="mode-card__radio" aria-hidden="true">
                        {mode === 'update_existing' ? (
                          <Check size={12} strokeWidth={3} className="text-white" />
                        ) : null}
                      </div>
                    </div>
                    <p className="mode-card__desc">
                      {language === 'uk'
                        ? 'Оновити дані тільки раніше прив’язаних товарів'
                        : 'Обновить данные только ранее привязанных товаров'}
                    </p>
                  </label>
                </div>
              </div>

              {/* Состав выгружаемых полей */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                  {language === 'uk' ? 'Дані для синхронізації' : 'Данные для синхронизации'}
                </label>

                <div className="checkbox-grid">
                  <label className="checkbox-item" htmlFor="checkbox-export-prices">
                    <input
                      type="checkbox"
                      checked={exportPrices}
                      onChange={(e) => setExportPrices(e.target.checked)}
                      id="checkbox-export-prices"
                    />
                    <DollarSign size={15} className="text-emerald" />
                    <span>{language === 'uk' ? 'Актуальні ціни' : 'Актуальные цены'}</span>
                  </label>

                  <label className="checkbox-item" htmlFor="checkbox-export-stock">
                    <input
                      type="checkbox"
                      checked={exportStock}
                      onChange={(e) => setExportStock(e.target.checked)}
                      id="checkbox-export-stock"
                    />
                    <Package size={15} className="text-indigo" />
                    <span>{language === 'uk' ? 'Залишки на складі' : 'Остатки склада'}</span>
                  </label>

                  <label className="checkbox-item" htmlFor="checkbox-export-categories">
                    <input
                      type="checkbox"
                      checked={exportCategories}
                      onChange={(e) => setExportCategories(e.target.checked)}
                      id="checkbox-export-categories"
                    />
                    <FolderTree size={15} className="text-amber" />
                    <span>{language === 'uk' ? 'Дерево категорій' : 'Дерево категорий'}</span>
                  </label>

                  <label className="checkbox-item" htmlFor="checkbox-export-images">
                    <input
                      type="checkbox"
                      checked={exportImages}
                      onChange={(e) => setExportImages(e.target.checked)}
                      id="checkbox-export-images"
                    />
                    <ImageIcon size={15} className="text-sky" />
                    <span>{language === 'uk' ? 'Посилання на фото' : 'Ссылки на фото'}</span>
                  </label>

                  <label className="checkbox-item" htmlFor="checkbox-export-descriptions">
                    <input
                      type="checkbox"
                      checked={exportDescriptions}
                      onChange={(e) => setExportDescriptions(e.target.checked)}
                      id="checkbox-export-descriptions"
                    />
                    <FileText size={15} className="text-indigo" />
                    <span>{language === 'uk' ? 'Описи товарів' : 'Описания товаров'}</span>
                  </label>
                </div>
              </div>

              {/* Ограничение количества */}
              <div>
                <label
                  htmlFor="export-limit-input"
                  className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1"
                >
                  {language === 'uk' ? 'Тестовий ліміт (необов’язково)' : 'Тестовый лимит (необязательно)'}
                </label>
                <input
                  type="number"
                  id="export-limit-input"
                  placeholder={language === 'uk' ? 'Наприклад, 50 позицій' : 'Например, 50 позиций'}
                  value={limit}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLimit(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
                  }}
                  className="input input--sm w-full font-mono"
                />
                <span className="text-[11px] text-muted">
                  {language === 'uk'
                    ? 'Залиште порожнім для експорту всієї бази Limansoft'
                    : 'Оставьте пустым для экспорта всей базы Limansoft'}
                </span>
              </div>
            </div>
          )}

          {/* Running Progress Screen */}
          {status === 'running' && (
            <div className="py-8 text-center space-y-6" id="export-running-screen">
              <div className="relative w-20 h-20 mx-auto">
                <Loader2 size={80} className="spinner text-emerald mx-auto" />
                <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-sm text-primary">
                  {progress}%
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-primary mb-1">
                  {language === 'uk' ? 'Експорт каталогу в Хорошоп...' : 'Экспорт каталога в Хорошоп...'}
                </h3>
                <p className="text-xs text-secondary">
                  {language === 'uk'
                    ? 'Фоновий воркер BullMQ пакетно відправляє товари в API /catalog/import/'
                    : 'Фоновый воркер BullMQ пакетно отправляет товары в API /catalog/import/'}
                </p>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill progress-fill--emerald"
                  style={{ width: `${Math.max(5, progress)}%` }}
                />
              </div>
            </div>
          )}

          {/* Completed Screen */}
          {status === 'completed' && (
            <div className="py-4 space-y-5 text-center" id="export-completed-screen">
              <div className="success-badge-glow">
                <CheckCircle2 size={30} className="text-emerald" />
              </div>

              <div>
                <h3 className="text-base font-bold text-primary mb-1">
                  {language === 'uk' ? 'Каталог успішно експортовано!' : 'Каталог успешно экспортирован!'}
                </h3>
                <p className="text-xs text-secondary">
                  {language === 'uk'
                    ? 'Дані товарів та зв’язки product_mappings успішно оновлено.'
                    : 'Данные товаров и связи product_mappings успешно обновлены.'}
                </p>
              </div>

              {stats && (
                <div className="stat-grid">
                  <div className="stat-box">
                    <div className="stat-box__label">{language === 'uk' ? 'Вивантажено' : 'Выгружено'}</div>
                    <div className="stat-box__value">
                      {stats.totalExported ?? 0}
                    </div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-box__label">{language === 'uk' ? 'Новинок' : 'Новинок'}</div>
                    <div className="stat-box__value text-emerald">
                      {stats.created ?? 0}
                    </div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-box__label">{language === 'uk' ? 'Оновлено' : 'Обновлено'}</div>
                    <div className="stat-box__value text-sky">
                      {stats.updated ?? 0}
                    </div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-box__label">{language === 'uk' ? 'Помилок' : 'Ошибок'}</div>
                    <div className="stat-box__value text-rose">
                      {stats.errors ?? 0}
                    </div>
                  </div>
                </div>
              )}

              {stats?.durationMs && (
                <div className="duration-pill">
                  <Clock size={13} className="text-muted" />
                  <span>
                    {language === 'uk' ? 'Час виконання:' : 'Время выполнения:'} {(stats.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error Screen */}
          {status === 'error' && (
            <div className="py-4 space-y-4 text-center" id="export-error-screen">
              <div className="w-12 h-12 bg-rose/10 border border-rose/30 rounded-full flex items-center justify-center mx-auto text-rose">
                <AlertCircle size={28} />
              </div>

              <div>
                <h3 className="text-base font-bold text-primary mb-1">
                  {language === 'uk' ? 'Помилка експорту каталогу' : 'Ошибка экспорта каталога'}
                </h3>
                <p className="text-xs text-rose max-w-sm mx-auto">
                  {errorMessage}
                </p>
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
