import React, { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { rozetkaApi } from '@/api/client';
import type { RozetkaTabProps, RozetkaPingStatus, RozetkaSyncReport } from './types';
import { RozetkaHealthGrid } from './RozetkaHealthGrid';
import { RozetkaActionHub } from './RozetkaActionHub';
import { RozetkaFeedCard } from './RozetkaFeedCard';
import { RozetkaWebhookCard } from './RozetkaWebhookCard';
import { RozetkaSettingsForm } from './RozetkaSettingsForm';

export const RozetkaTab: React.FC<RozetkaTabProps> = ({
  tenantId,
  tenant,
  onTenantUpdated,
}) => {
  const { t } = useLanguage();

  // Status State
  const [pingStatus, setPingStatus] = useState<RozetkaPingStatus>({ loading: false });

  // Action State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<RozetkaSyncReport | null>(null);

  // Ping Rozetka Seller API
  const handlePing = useCallback(async () => {
    setPingStatus({ loading: true });
    try {
      const res = await rozetkaApi.ping(tenantId);
      setPingStatus({
        loading: false,
        success: true,
        message: res.data?.message || t('rozetkaPingSuccess'),
      });
    } catch (err: any) {
      setPingStatus({
        loading: false,
        success: false,
        message:
          err.response?.data?.message ||
          err.message ||
          t('statusDisconnected'),
      });
    }
  }, [tenantId, t]);

  useEffect(() => {
    if (tenant?.rozetkaClientId) {
      handlePing();
    }
  }, [tenant?.rozetkaClientId, handlePing]);

  // Trigger Sync
  const handleSyncPricesStocks = async () => {
    setIsSyncing(true);
    setSyncReport(null);
    try {
      const res = await rozetkaApi.syncPricesStocks(tenantId);
      const count = res.data?.updatedCount ?? res.data?.updated ?? 'OK';
      setSyncReport({
        success: true,
        message: t('rozetkaExportSuccess').replace('{count}', String(count)),
      });
    } catch (err: any) {
      setSyncReport({
        success: false,
        message:
          err.response?.data?.message || err.message || t('error'),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const feedUrl = `${window.location.origin}/api/v1/rozetka/${tenantId}/feed.xml`;
  const webhookUrl = `${window.location.origin}/api/v1/rozetka/${tenantId}/webhook/order`;
  const hasRozetkaClientId = Boolean(tenant?.rozetkaClientId);
  const exportEnabled = Boolean(tenant?.rozetkaExportEnabled);

  return (
    <div className="space-y-6" id="rozetka-tab-content">
      {/* Светофор подключения Rozetka */}
      <RozetkaHealthGrid
        pingStatus={pingStatus}
        hasRozetkaClientId={hasRozetkaClientId}
        exportEnabled={exportEnabled}
        onPing={handlePing}
      />

      {/* Action Hub */}
      <RozetkaActionHub
        hasRozetkaClientId={hasRozetkaClientId}
        isSyncing={isSyncing}
        syncReport={syncReport}
        onSyncPricesStocks={handleSyncPricesStocks}
      />

      {/* Фид каталога товаров */}
      <RozetkaFeedCard feedUrl={feedUrl} />

      {/* Вебхук заказов */}
      <RozetkaWebhookCard webhookUrl={webhookUrl} />

      {/* Форма настроек Rozetka API */}
      <RozetkaSettingsForm
        tenantId={tenantId}
        tenant={tenant}
        onTenantUpdated={onTenantUpdated}
        onSettingsSaved={handlePing}
      />
    </div>
  );
};
