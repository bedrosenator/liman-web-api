import React from 'react';
import type { PromTabProps } from './types';
import { PromWizard } from './PromWizard';
import { PromHealthGrid } from './PromHealthGrid';
import { PromActionHub } from './PromActionHub';
import { PromSettingsForm } from './PromSettingsForm';
import { PromExportModal } from './PromExportModal';
import { PromImportModal } from './PromImportModal';
import { ActivityFeed } from '../ActivityFeed';
import { usePromTabState } from './usePromTabState';

export const PromTab: React.FC<PromTabProps> = ({
  tenantId,
  tenant,
  onTenantUpdated,
  activities,
  isLoadingActivities,
  onRefreshActivities,
}) => {
  const {
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
    handleCopyFeed,
    handleCopyWebhook,
    handlePing,
    checkMariaDb,
    handleSaveSettings,
    handleSyncStock,
  } = usePromTabState({
    tenantId,
    tenant,
    onTenantUpdated,
    onRefreshActivities,
  });

  return (
    <div className="space-y-6" id="prom-tab-content">
      {/* 1. Диагностический блок «Светофор» (3-Point Health Bar) */}
      <PromHealthGrid
        mariadbStatus={mariadbStatus}
        promStatus={promStatus}
        hasApiKey={Boolean(tenant?.promApiKey)}
        exportEnabled={exportEnabled}
        syncInterval={syncInterval}
        onPingProm={handlePing}
      />

      {/* 2. Onboarding Wizard (Шаги подключения) */}
      <PromWizard />

      {/* 3. Action Hub & YML фид (3 карточки) */}
      <PromActionHub
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        syncStatusStep={syncStatusStep}
        syncReport={syncReport}
        feedUrl={feedUrl}
        isFeedCopied={isFeedCopied}
        onCopyFeed={handleCopyFeed}
        onSyncStock={handleSyncStock}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
      />

      {/* 4. Настройки API и Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PromSettingsForm
          shopTitle={shopTitle}
          setShopTitle={setShopTitle}
          apiKey={apiKey}
          setApiKey={setApiKey}
          showApiKey={showApiKey}
          setShowApiKey={setShowApiKey}
          exportEnabled={exportEnabled}
          setExportEnabled={setExportEnabled}
          syncInterval={syncInterval}
          setSyncInterval={setSyncInterval}
          orderWebhookEnabled={orderWebhookEnabled}
          setOrderWebhookEnabled={setOrderWebhookEnabled}
          createOrderDocumentEnabled={createOrderDocumentEnabled}
          setCreateOrderDocumentEnabled={setCreateOrderDocumentEnabled}
          webhookUrl={webhookUrl}
          isWebhookCopied={isWebhookCopied}
          onCopyWebhook={handleCopyWebhook}
          isSaving={isSaving}
          saveSuccess={saveSuccess}
          saveError={saveError}
          onSubmit={handleSaveSettings}
        />

        <ActivityFeed
          activities={activities || []}
          isLoading={isLoadingActivities || false}
          onRefresh={onRefreshActivities || (() => {})}
        />
      </div>

      {/* Модалки импорта / экспорта */}
      <PromExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        tenantId={tenantId}
        onExportFinished={() => {
          onTenantUpdated();
          handlePing();
          onRefreshActivities?.();
        }}
      />

      <PromImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tenantId={tenantId}
        onImportFinished={() => {
          onTenantUpdated();
          checkMariaDb();
          onRefreshActivities?.();
        }}
      />
    </div>
  );
};
