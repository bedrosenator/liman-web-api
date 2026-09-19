import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { backupApi } from '@/api/client';
import type {
  BackupItem,
  BackupReport,
  BackupsTabProps,
} from './backups';
import {
  BackupHeader,
  BackupsTable,
  RestoreBackupModal,
  DeleteBackupModal,
} from './backups';

export const BackupsTab: React.FC<BackupsTabProps> = ({ tenantId }) => {
  const { language } = useLanguage();

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState<'fast' | 'full' | null>(null);
  const [createReport, setCreateReport] = useState<BackupReport | null>(null);

  // Restore Modal State
  const [restoreCandidate, setRestoreCandidate] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<BackupReport | null>(null);

  // Delete State
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBackups = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await backupApi.list(tenantId);
      setBackups(res.data?.backups || []);
    } catch (err: any) {
      console.error('Failed to list backups:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Create Backup
  const handleCreate = async (mode: 'fast' | 'full') => {
    setIsCreating(mode);
    setCreateReport(null);
    try {
      const res = await backupApi.create(tenantId, mode);
      setCreateReport({
        success: true,
        message:
          language === 'uk'
            ? `Резервну копію успішно створено (${res.data?.filename || mode})`
            : `Резервная копия успешно создана (${res.data?.filename || mode})`,
      });
      await fetchBackups();
    } catch (err: any) {
      setCreateReport({
        success: false,
        message:
          err.response?.data?.message ||
          err.message ||
          (language === 'uk'
            ? 'Помилка створення бекапу'
            : 'Ошибка создания бэкапа'),
      });
    } finally {
      setIsCreating(null);
    }
  };

  // Download
  const handleDownload = async (filename: string) => {
    try {
      const res = await backupApi.download(tenantId, filename);
      const blob = new Blob([res.data], { type: 'application/gzip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  // Restore
  const handleConfirmRestore = async () => {
    if (!restoreCandidate) return;
    setIsRestoring(true);
    setRestoreResult(null);
    try {
      await backupApi.restore(tenantId, restoreCandidate);
      setRestoreResult({
        success: true,
        message:
          language === 'uk'
            ? `Базу даних успішно відновлено з архіву ${restoreCandidate}`
            : `База данных успешно восстановлена из архива ${restoreCandidate}`,
      });
      setTimeout(() => {
        setRestoreCandidate(null);
      }, 2000);
    } catch (err: any) {
      setRestoreResult({
        success: false,
        message:
          err.response?.data?.message ||
          err.message ||
          (language === 'uk'
            ? 'Помилка відновлення'
            : 'Ошибка восстановления'),
      });
    } finally {
      setIsRestoring(false);
    }
  };

  // Delete
  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      await backupApi.delete(tenantId, deleteCandidate);
      setDeleteCandidate(null);
      await fetchBackups();
    } catch (err: any) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6" id="backups-tab-content">
      <BackupHeader
        isLoading={isLoading}
        isCreating={isCreating}
        createReport={createReport}
        onRefresh={fetchBackups}
        onCreate={handleCreate}
      />

      <BackupsTable
        backups={backups}
        isLoading={isLoading}
        onDownload={handleDownload}
        onSelectRestore={(filename) => setRestoreCandidate(filename)}
        onSelectDelete={(filename) => setDeleteCandidate(filename)}
      />

      <RestoreBackupModal
        candidate={restoreCandidate}
        isRestoring={isRestoring}
        restoreResult={restoreResult}
        onConfirm={handleConfirmRestore}
        onClose={() => {
          setRestoreCandidate(null);
          setRestoreResult(null);
        }}
      />

      <DeleteBackupModal
        candidate={deleteCandidate}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteCandidate(null)}
      />
    </div>
  );
};
export default BackupsTab;
