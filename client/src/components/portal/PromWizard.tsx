import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

export function PromWizard() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="card card--subtle mb-6" id="prom-wizard">
      <div
        className="card__header flex justify-between items-center cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <HelpCircle size={18} className="text-sky" />
          <h3 className="font-semibold text-sm text-primary">{t('promWizardTitle')}</h3>
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
                <div className="w-7 h-7 rounded-full bg-sky-soft text-sky flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <h4 className="font-semibold text-xs text-primary">{t('promWizardStep1')}</h4>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {t('promWizardStep1Desc')}
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-elevated p-4 rounded-lg border border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-emerald-soft text-emerald flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h4 className="font-semibold text-xs text-primary">{t('promWizardStep2')}</h4>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {t('promWizardStep2Desc')}
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-elevated p-4 rounded-lg border border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-amber-soft text-amber flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <h4 className="font-semibold text-xs text-primary">{t('promWizardStep3')}</h4>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {t('promWizardStep3Desc')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
