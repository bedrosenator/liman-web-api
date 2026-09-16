import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

export function HoroshopWizard() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="card card--subtle mb-6" id="horoshop-wizard">
      <div
        className="card__header flex justify-between items-center cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <HelpCircle size={18} className="text-indigo" />
          <h3 className="font-semibold text-sm text-primary">{t('wizardTitle')}</h3>
        </div>
        <button
          type="button"
          className="btn-icon btn-icon--xs"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {isOpen && (
        <div className="card__body p-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            {/* Step 1 */}
            <div className="bg-elevated p-4 rounded-lg border border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-indigo-soft text-indigo flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <h4 className="font-semibold text-xs text-primary">{t('wizardStep1')}</h4>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {t('wizardStep1Desc')}
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-elevated p-4 rounded-lg border border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-emerald-soft text-emerald flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h4 className="font-semibold text-xs text-primary">{t('wizardStep2')}</h4>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {t('wizardStep2Desc')}
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-elevated p-4 rounded-lg border border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-amber-soft text-amber flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <h4 className="font-semibold text-xs text-primary">{t('wizardStep3')}</h4>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {t('wizardStep3Desc')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
