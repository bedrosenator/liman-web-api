import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface ModalErrorScreenProps {
  id?: string;
  title: string;
  errorMessage: string | null;
}

export const ModalErrorScreen: React.FC<ModalErrorScreenProps> = ({
  id,
  title,
  errorMessage,
}) => {
  return (
    <div className="py-4 space-y-4 text-center" id={id}>
      <div className="w-12 h-12 bg-rose/10 border border-rose/30 rounded-full flex items-center justify-center mx-auto text-rose">
        <AlertCircle size={28} />
      </div>
      <div>
        <h3 className="text-base font-bold text-primary mb-1">{title}</h3>
        <p className="text-xs text-rose max-w-sm mx-auto">{errorMessage}</p>
      </div>
    </div>
  );
};
