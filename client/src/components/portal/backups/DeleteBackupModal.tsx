import React from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface DeleteBackupModalProps {
  candidate: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const DeleteBackupModal: React.FC<DeleteBackupModalProps> = ({
  candidate,
  isDeleting,
  onConfirm,
  onClose,
}) => {
  const { t, language } = useLanguage();

  if (!candidate) return null;

  return (
    <div className="modal-overlay" id="delete-confirm-modal">
      <div className="modal-content max-w-sm">
        <div className="modal-header">
          <div className="modal-title-row text-rose">
            <Trash2 size={20} />
            <h3 className="modal-title">
              {language === 'uk' ? 'Видалити архів?' : 'Удалить архив?'}
            </h3>
          </div>
        </div>

        <div className="modal-body">
          <p className="text-xs text-secondary leading-relaxed">
            {language === 'uk'
              ? `Видалити файл бекапу ${candidate}?`
              : `Удалить файл бэкапа ${candidate}?`}
          </p>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onClose}
            disabled={isDeleting}
          >
            {t('cancel')}
          </button>

          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={onConfirm}
            disabled={isDeleting}
            id="btn-confirm-delete-backup"
          >
            {isDeleting && <Loader2 size={14} className="spinner" />}
            <span>{language === 'uk' ? 'Видалити' : 'Удалить'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
