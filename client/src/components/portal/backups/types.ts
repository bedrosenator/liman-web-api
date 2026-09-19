export interface BackupItem {
  filename: string;
  filepath: string;
  sizeBytes: number;
  createdAt: string;
  mode: 'fast' | 'full';
  tables: string[];
  sha256?: string;
}

export interface BackupReport {
  success: boolean;
  message: string;
}

export interface BackupsTabProps {
  tenantId: string;
}
