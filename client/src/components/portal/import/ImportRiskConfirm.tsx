import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ImportRiskConfirmProps {
  riskAccepted: boolean;
  onRiskChange: (accepted: boolean) => void;
}

export const ImportRiskConfirm: React.FC<ImportRiskConfirmProps> = ({
  riskAccepted,
  onRiskChange,
}) => {
  const { t } = useLanguage();

  return (
    <div
      className="warning-box--rose space-y-3"
      id="overwrite-warning-box"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="text-rose flex-shrink-0 mt-0.5" />
        <p className="text-xs text-rose font-medium leading-relaxed">
          {t('overwriteConfirm')}
        </p>
      </div>

      <label className="checkbox-item" htmlFor="chk-risk-accepted">
        <input
          type="checkbox"
          checked={riskAccepted}
          onChange={(e) => onRiskChange(e.target.checked)}
          id="chk-risk-accepted"
        />
        <span className="text-xs font-semibold text-rose">
          {t('overwriteCheckbox')}
        </span>
      </label>
    </div>
  );
};
