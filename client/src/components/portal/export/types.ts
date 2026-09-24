export type ExportMode = 'full_overwrite' | 'only_new' | 'update_existing';

export interface ExportCategory {
  id: number;
  title: string;
  fullPath: string;
}

export interface ExportStats {
  totalFetched?: number;
  totalExported?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  durationMs?: number;
  errorDetails?: Array<{ article: string; message: string }>;
  message?: string;
}

export interface HoroshopExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onExportFinished?: () => void;
}
