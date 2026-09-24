import { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { promApi, tenantsApi, limanApi, syncApi } from '@/api/client';
import type { PromTabProps, MariaDbStatus, PromStatus, SyncReport } from './types';

export function usePromTabState({
  tenantId,
  tenant,
  onTenantUpdated,
  onRefreshActivities,
}: Pick<PromTabProps, 'tenantId' | 'tenant' | 'onTenantUpdated' | 'onRefreshActivities'>) {
  const { t, language } = useLanguage();

  // Status States
  const [mariadbStatus, setMariadbStatus] = useState<MariaDbStatus>({ loading: false });
  const [promStatus, setPromStatus] = useState<PromStatus>({ loading: false });

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Form State
  const [shopTitle, setShopTitle] = useState(tenant?.promShopTitle || '');
  const [apiKey, setApiKey] = useState(tenant?.promApiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [exportEnabled, setExportEnabled] = useState(Boolean(tenant?.promExportEnabled));
  const [syncInterval, setSyncInterval] = useState<number>(tenant?.promSyncIntervalMinutes || 15);
  const [orderWebhookEnabled, setOrderWebhookEnabled] = useState(tenant?.promOrderWebhookEnabled !== false);
  const [createOrderDocumentEnabled, setCreateOrderDocumentEnabled] = useState(Boolean(tenant?.promCreateOrderDocumentEnabled));

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Action State & Live BullMQ Progress
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncStatusStep, setSyncStatusStep] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);

  // Copy & Action States
  const [isFeedCopied, setIsFeedCopied] = useState(false);
  const [isWebhookCopied, setIsWebhookCopied] = useState(false);
  const [isSendingFeed, setIsSendingFeed] = useState(false);
  const [sendFeedResult, setSendFeedResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sync state with tenant props
  useEffect(() => {
    if (tenant) {
      setShopTitle(tenant.promShopTitle || '');
      setApiKey(tenant.promApiKey || '');
      setExportEnabled(Boolean(tenant.promExportEnabled));
      setSyncInterval(tenant.promSyncIntervalMinutes || 15);
      setOrderWebhookEnabled(tenant.promOrderWebhookEnabled !== false);
      setCreateOrderDocumentEnabled(Boolean(tenant.promCreateOrderDocumentEnabled));
    }
  }, [tenant]);

  // Check MariaDB ping
  const checkMariaDb = useCallback(async () => {
    setMariadbStatus({ loading: true });
    const start = Date.now();
    try {
      await limanApi.ping(tenantId);
      const pingMs = Date.now() - start;
      setMariadbStatus({ loading: false, success: true, pingMs });
    } catch {
      setMariadbStatus({ loading: false, success: false });
    }
  }, [tenantId]);

  // Ping Prom API
  const handlePing = useCallback(async () => {
    setPromStatus({ loading: true });
    try {
      const res = await promApi.ping(tenantId);
      setPromStatus({
        loading: false,
        success: true,
        shopTitle: res.data?.shopTitle || tenant?.promShopTitle,
        message: res.data?.message || t('promPingSuccess'),
      });
      if (res.data?.shopTitle && res.data.shopTitle !== shopTitle) {
        setShopTitle(res.data.shopTitle);
        onTenantUpdated();
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { message?: string } }; message?: string };
      setPromStatus({
        loading: false,
        success: false,
        message:
          errorObj.response?.data?.message ||
          errorObj.message ||
          t('statusDisconnected'),
      });
    }
  }, [tenantId, t, shopTitle, tenant?.promShopTitle, onTenantUpdated]);

  // Initial checks
  useEffect(() => {
    checkMariaDb();
    if (tenant?.promApiKey) {
      handlePing();
    }
  }, [tenant?.promApiKey, checkMariaDb, handlePing]);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const payload: Record<string, string | number | boolean | undefined> = {
        promShopTitle: shopTitle.trim() || undefined,
        promExportEnabled: exportEnabled,
        promSyncIntervalMinutes: Number(syncInterval),
        promOrderWebhookEnabled: orderWebhookEnabled,
        promCreateOrderDocumentEnabled: createOrderDocumentEnabled,
      };

      if (apiKey && apiKey !== '••••••••' && apiKey !== '********') {
        payload.promApiKey = apiKey.trim();
      }

      await tenantsApi.update(tenantId, payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onTenantUpdated();
      handlePing();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { message?: string } }; message?: string };
      setSaveError(errorObj.response?.data?.message || errorObj.message || t('error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger Sync Prices and Stocks with Live BullMQ Progress
  const handleSyncStock = async () => {
    setIsSyncing(true);
    setSyncReport(null);
    setSyncProgress(0);
    setSyncStatusStep(t('jobQueued'));
    try {
      const res = await promApi.syncStock(tenantId);
      const jobId = res.data?.jobId;

      if (jobId) {
        setSyncStatusStep(`${t('queueActiveSync')} (#${jobId})...`);
        await new Promise<void>((resolve, reject) => {
          const pollTimer = setInterval(async () => {
            try {
              const statusRes = await syncApi.getJobStatus('sync-stock', jobId);
              const job = statusRes.data;

              if (typeof job.progress === 'number') {
                setSyncProgress(job.progress);
                setSyncStatusStep(`${t('queueActiveSync')}: ${job.progress}%...`);
              }

              if (job.state === 'completed') {
                clearInterval(pollTimer);
                const updatedCount = job.result?.processed ?? 0;
                setSyncReport({
                  success: true,
                  message:
                    language === 'uk'
                      ? `Успішно оновлено ${updatedCount} товарів у Prom.ua`
                      : `Успешно обновлено ${updatedCount} товаров в Prom.ua`,
                  updated: updatedCount,
                  processed: updatedCount,
                });
                resolve();
              } else if (job.state === 'failed') {
                clearInterval(pollTimer);
                reject(new Error(job.error || 'Ошибка при синхронизации остатков'));
              }
            } catch (pollErr) {
              clearInterval(pollTimer);
              reject(pollErr);
            }
          }, 800);
        });
      } else {
        setSyncReport({
          success: true,
          message: t('promSyncQueued'),
        });
      }
      onRefreshActivities?.();
    } catch (err: unknown) {
      const errorObj = err as {
        response?: { data?: { error?: { message?: string }; message?: string } };
        message?: string;
      };
      setSyncReport({
        success: false,
        message:
          errorObj.response?.data?.error?.message ||
          errorObj.response?.data?.message ||
          errorObj.message ||
          t('error'),
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
      setSyncStatusStep(null);
    }
  };

  const feedUrl = `${window.location.origin}/api/v1/prom/${tenantId}/feed.xml`;
  const webhookUrl = `${window.location.origin}/api/v1/prom/${tenantId}/webhook/order`;

  const handleCopyFeed = () => {
    navigator.clipboard.writeText(feedUrl);
    setIsFeedCopied(true);
    setTimeout(() => setIsFeedCopied(false), 2000);
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setIsWebhookCopied(true);
    setTimeout(() => setIsWebhookCopied(false), 2000);
  };

  const handleSendFeed = async () => {
    setIsSendingFeed(true);
    setSendFeedResult(null);
    try {
      const res = await promApi.sendFeedUrl(tenantId);
      setSendFeedResult({
        success: Boolean(res.data?.success),
        message: res.data?.success
          ? res.data.message || t('feedSentSuccess')
          : res.data?.error || t('feedSentError'),
      });
      onRefreshActivities?.();
    } catch (err: any) {
      setSendFeedResult({
        success: false,
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          t('feedSentError'),
      });
      onRefreshActivities?.();
    } finally {
      setIsSendingFeed(false);
    }
  };

  return {
    mariadbStatus,
    promStatus,
    isImportModalOpen,
    setIsImportModalOpen,
    isExportModalOpen,
    setIsExportModalOpen,
    shopTitle,
    setShopTitle,
    apiKey,
    setApiKey,
    showApiKey,
    setShowApiKey,
    exportEnabled,
    setExportEnabled,
    syncInterval,
    setSyncInterval,
    orderWebhookEnabled,
    setOrderWebhookEnabled,
    createOrderDocumentEnabled,
    setCreateOrderDocumentEnabled,
    isSaving,
    saveSuccess,
    saveError,
    isSyncing,
    syncProgress,
    syncStatusStep,
    syncReport,
    feedUrl,
    webhookUrl,
    isFeedCopied,
    isWebhookCopied,
    isSendingFeed,
    sendFeedResult,
    handleCopyFeed,
    handleCopyWebhook,
    handleSendFeed,
    handlePing,
    checkMariaDb,
    handleSaveSettings,
    handleSyncStock,
  };
}
