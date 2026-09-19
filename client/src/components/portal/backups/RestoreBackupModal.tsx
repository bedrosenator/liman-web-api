import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { BackupReport } from './types';

interface RestoreBackupModalProps {
  candidate: string | null;
  isRestoring: boolean;
  restoreResult: BackupReport | null;
  onConfirm: () => void;
  onClose: () => void;
}

export const RestoreBackupModal: React.FC<RestoreBackupModalProps> = ({
  candidate,
  isRestoring,
  restoreResult,
  onConfirm,
  onClose,
}) => {
  const { t, language } = useLanguage();

  if (!candidate) return null;

  return (
    <div className="modal-overlay" id="restore-confirm-modal">
      <div className="modal-content max-w-md">
        <div className="modal-header">
          <div className="modal-title-row text-amber">
            <AlertTriangle size={20} />
            <h3 className="modal-title">
              {language === 'uk'
                ? 'Підтвердження відкату БД'
                : 'Подтверждение отката БД'}
            </h3>
          </div>
        </div>

        <div className="modal-body space-y-3">
          <p className="text-xs text-secondary leading-relaxed">
            {language === 'uk'
              ? 'Ви збираєтеся відновити базу даних MariaDB з архіву:'
              : 'Вы собираетесь восстановить базу данных MariaDB из архива:'}
          </p>
          <div className="p-2.5 rounded-lg bg-elevated font-mono text-xs text-primary break-all border border-border">
            {candidate}
          </div>
          <p className="text-xs text-rose font-medium leading-relaxed">
            ⚠️{' '}
            {language === 'uk'
              ? 'Поточні залишки та ціни в MariaDB будуть перезаписані даними з архіву! Операція незворотна.'
              : 'Текущие остатки и цены в MariaDB будут перезаписаны данными из архива! Операция необратима.'}
          </p>

          {restoreResult && (
            <div
              className={`p-3 rounded-lg text-xs ${
                restoreResult.success
                  ? 'bg-emerald/10 text-emerald border border-emerald/20'
                  : 'bg-rose/10 text-rose border border-rose/20'
              }`}
            >
              {restoreResult.message}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onClose}
            disabled={isRestoring}
          >
            {t('cancel')}
          </button>

          <button
            type="button"
            className="btn btn--primary btn--sm gap-1.5"
            onClick={onConfirm}
            disabled={isRestoring}
            id="btn-confirm-restore-backup"
          >
            {isRestoring && <Loader2 size={14} className="spinner" />}
            <span>
              {language === 'uk' ? 'Відновити базу' : 'Восстановить базу'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
