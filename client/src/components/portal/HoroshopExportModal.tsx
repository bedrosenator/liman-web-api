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
        err.response?.data?.message || err.message || 'Ошибка запуска экспорта каталога',
      );
    }
  };

  return (
    <div className="modal-overlay" id="horoshop-export-modal-overlay">
      <div
        className="modal modal--md max-w-xl w-full bg-elevated border border-subtle rounded-xl p-6 shadow-2xl"
        id="horoshop-export-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-subtle mb-4">
          <div className="flex items-center gap-2">
            <Upload size={20} className="text-emerald" />
            <h2 className="text-lg font-bold text-primary">
              {language === 'uk' ? 'Прямий експорт каталогу в Хорошоп' : 'Прямой экспорт каталога в Хорошоп'}
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
            {/* Режим выгрузки */}
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                {language === 'uk' ? 'Режим вивантаження' : 'Режим выгрузки'}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Режим 1: Полная выгрузка */}
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    mode === 'full_overwrite'
                      ? 'border-emerald bg-emerald/10 shadow-sm'
                      : 'border-subtle bg-canvas hover:border-muted'
                  }`}
                  onClick={() => setMode('full_overwrite')}
                  id="mode-full-overwrite"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap size={16} className="text-emerald" />
                    <span className="text-xs font-bold text-primary">
                      {language === 'uk' ? 'Всі товари' : 'Все товары'}
                    </span>
                  </div>
                  <p className="text-[11px] text-secondary leading-relaxed">
                    {language === 'uk'
                      ? 'Повне оновлення та експорт всього каталогу'
                      : 'Полное обновление и экспорт всего каталога'}
                  </p>
                </div>

                {/* Режим 2: Только новинки */}
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    mode === 'only_new'
                      ? 'border-indigo bg-indigo/10 shadow-sm'
                      : 'border-subtle bg-canvas hover:border-muted'
                  }`}
                  onClick={() => setMode('only_new')}
                  id="mode-only-new"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={16} className="text-indigo" />
                    <span className="text-xs font-bold text-primary">
                      {language === 'uk' ? 'Тільки новинки' : 'Только новинки'}
                    </span>
                  </div>
                  <p className="text-[11px] text-secondary leading-relaxed">
                    {language === 'uk'
                      ? 'Вивантажити лише нові, ще не створені позиції'
                      : 'Выгрузить только новые, еще не созданные позиции'}
                  </p>
                </div>

                {/* Режим 3: Обновление существующих */}
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    mode === 'update_existing'
                      ? 'border-sky bg-sky/10 shadow-sm'
                      : 'border-subtle bg-canvas hover:border-muted'
                  }`}
                  onClick={() => setMode('update_existing')}
                  id="mode-update-existing"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <RefreshCw size={16} className="text-sky" />
                    <span className="text-xs font-bold text-primary">
                      {language === 'uk' ? 'Оновити існуючі' : 'Обновить сущ.'}
                    </span>
                  </div>
                  <p className="text-[11px] text-secondary leading-relaxed">
                    {language === 'uk'
                      ? 'Оновити дані тільки раніше прив’язаних товарів'
                      : 'Обновить данные только ранее привязанных товаров'}
                  </p>
                </div>
              </div>
            </div>

            {/* Состав выгружаемых полей */}
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                {language === 'uk' ? 'Дані для синхронізації' : 'Данные для синхронизации'}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-canvas border border-subtle rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-primary select-none">
                  <input
                    type="checkbox"
                    checked={exportPrices}
                    onChange={(e) => setExportPrices(e.target.checked)}
                    className="checkbox"
                    id="checkbox-export-prices"
                  />
                  <DollarSign size={14} className="text-emerald" />
                  <span>{language === 'uk' ? 'Актуальні ціни' : 'Актуальные цены'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-primary select-none">
                  <input
                    type="checkbox"
                    checked={exportStock}
                    onChange={(e) => setExportStock(e.target.checked)}
                    className="checkbox"
                    id="checkbox-export-stock"
                  />
                  <Package size={14} className="text-indigo" />
                  <span>{language === 'uk' ? 'Залишки на складі' : 'Остатки склада'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-primary select-none">
                  <input
                    type="checkbox"
                    checked={exportCategories}
                    onChange={(e) => setExportCategories(e.target.checked)}
                    className="checkbox"
                    id="checkbox-export-categories"
                  />
                  <FolderTree size={14} className="text-amber" />
                  <span>{language === 'uk' ? 'Дерево категорій' : 'Дерево категорий'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-primary select-none">
                  <input
                    type="checkbox"
                    checked={exportImages}
                    onChange={(e) => setExportImages(e.target.checked)}
                    className="checkbox"
                    id="checkbox-export-images"
                  />
                  <ImageIcon size={14} className="text-sky" />
                  <span>{language === 'uk' ? 'Посилання на фото' : 'Ссылки на фото'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-primary select-none sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={exportDescriptions}
                    onChange={(e) => setExportDescriptions(e.target.checked)}
                    className="checkbox"
                    id="checkbox-export-descriptions"
                  />
                  <FileText size={14} className="text-purple-500" />
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

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-subtle">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={onClose}
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

            <div className="w-full bg-subtle h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Completed Screen */}
        {status === 'completed' && (
          <div className="py-4 space-y-5 text-center" id="export-completed-screen">
            <div className="w-12 h-12 bg-emerald/10 border border-emerald/30 rounded-full flex items-center justify-center mx-auto text-emerald">
              <CheckCircle2 size={28} />
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                <div className="p-3 bg-canvas border border-subtle rounded-lg">
                  <div className="text-[11px] text-muted">{language === 'uk' ? 'Вивантажено' : 'Выгружено'}</div>
                  <div className="text-lg font-bold font-mono text-primary">
                    {stats.totalExported ?? 0}
                  </div>
                </div>

                <div className="p-3 bg-canvas border border-subtle rounded-lg">
                  <div className="text-[11px] text-muted">{language === 'uk' ? 'Новинок' : 'Новинок'}</div>
                  <div className="text-lg font-bold font-mono text-emerald">
                    {stats.created ?? 0}
                  </div>
                </div>

                <div className="p-3 bg-canvas border border-subtle rounded-lg">
                  <div className="text-[11px] text-muted">{language === 'uk' ? 'Оновлено' : 'Обновлено'}</div>
                  <div className="text-lg font-bold font-mono text-sky">
                    {stats.updated ?? 0}
                  </div>
                </div>

                <div className="p-3 bg-canvas border border-subtle rounded-lg">
                  <div className="text-[11px] text-muted">{language === 'uk' ? 'Помилок' : 'Ошибок'}</div>
                  <div className="text-lg font-bold font-mono text-rose">
                    {stats.errors ?? 0}
                  </div>
                </div>
              </div>
            )}

            {stats?.durationMs && (
              <div className="text-xs text-muted flex items-center justify-center gap-1.5 font-mono">
                <Clock size={13} />
                <span>
                  {language === 'uk' ? 'Час виконання:' : 'Время выполнения:'} {(stats.durationMs / 1000).toFixed(1)}s
                </span>
              </div>
            )}

            <div className="pt-3 border-t border-subtle">
              <button
                type="button"
                className="btn btn--primary btn--sm w-full justify-center"
                id="btn-close-export-modal"
                onClick={onClose}
              >
                {t('close')}
              </button>
            </div>
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

            <div className="flex items-center justify-center gap-3 pt-3 border-t border-subtle">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={onClose}
              >
                {t('close')}
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => setStatus('idle')}
              >
                {language === 'uk' ? 'Спробувати знову' : 'Попробовать снова'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
