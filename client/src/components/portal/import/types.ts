export type ImportMode = 'only_new' | 'overwrite';

export interface ImportStats {
  totalFetched?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  backupId?: string;
}

export interface HoroshopImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onImportFinished?: () => void;
}
