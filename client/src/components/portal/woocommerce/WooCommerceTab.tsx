import React, { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { woocommerceApi } from '@/api/client';
import type { WooCommerceTabProps, WooPingStatus, WooActionReport } from './types';
import { WooHealthGrid } from './WooHealthGrid';
import { WooPluginCard } from './WooPluginCard';
import { WooActionHub } from './WooActionHub';
import { WooWebhooksCard } from './WooWebhooksCard';
import { WooSettingsForm } from './WooSettingsForm';

export const WooCommerceTab: React.FC<WooCommerceTabProps> = ({
  tenantId,
  tenant,
  onTenantUpdated,
}) => {
  const { t } = useLanguage();

  // Status State
  const [pingStatus, setPingStatus] = useState<WooPingStatus>({ loading: false });

  // Action State
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionReport, setActionReport] = useState<WooActionReport | null>(null);

  // Ping WooCommerce
  const handlePing = useCallback(async () => {
    setPingStatus({ loading: true });
    try {
      const res = await woocommerceApi.ping(tenantId);
      setPingStatus({
        loading: false,
        success: res.data?.success ?? true,
        message: res.data?.message || t('wooPingSuccess'),
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
    if (tenant?.woocommerceUrl && tenant?.woocommerceConsumerKey) {
      handlePing();
    }
  }, [tenant?.woocommerceUrl, tenant?.woocommerceConsumerKey, handlePing]);

  // Actions
  const handlePushCatalog = async () => {
    setActionLoading('push');
    setActionReport(null);
    try {
      await woocommerceApi.syncProducts(tenantId);
      setActionReport({
        success: true,
        message: t('wooSyncLaunchedSuccess'),
      });
    } catch (err: any) {
      setActionReport({
        success: false,
        message: err.response?.data?.message || err.message || t('error'),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncStock = async () => {
    setActionLoading('stock');
    setActionReport(null);
    try {
      await woocommerceApi.syncStock(tenantId);
      setActionReport({
        success: true,
        message: t('wooSyncStockSuccess'),
      });
    } catch (err: any) {
      setActionReport({
        success: false,
        message: err.response?.data?.message || err.message || t('error'),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleImportCatalog = async () => {
    setActionLoading('import');
    setActionReport(null);
    try {
      await woocommerceApi.importCatalog(tenantId);
      setActionReport({
        success: true,
        message: t('wooImportSuccess'),
      });
    } catch (err: any) {
      setActionReport({
        success: false,
        message: err.response?.data?.message || err.message || t('error'),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const downloadUrl = woocommerceApi.getPluginDownloadUrl(tenantId);
  const orderWebhookUrl = `${window.location.origin}/api/v1/woocommerce/${tenantId}/webhook/order`;
  const productWebhookUrl = `${window.location.origin}/api/v1/woocommerce/${tenantId}/webhook/product`;
  const hasWooCommerceUrl = Boolean(tenant?.woocommerceUrl);
  const syncEnabled = Boolean(tenant?.woocommerceSyncEnabled);

  return (
    <div className="space-y-6" id="woocommerce-tab-content">
      {/* Светофор подключения WooCommerce */}
      <WooHealthGrid
        pingStatus={pingStatus}
        hasWooCommerceUrl={hasWooCommerceUrl}
        syncEnabled={syncEnabled}
        onPing={handlePing}
      />

      {/* Скачивание плагина WordPress */}
      <WooPluginCard downloadUrl={downloadUrl} />

      {/* Action Hub */}
      <WooActionHub
        hasWooCommerceUrl={hasWooCommerceUrl}
        actionLoading={actionLoading}
        actionReport={actionReport}
        onPushCatalog={handlePushCatalog}
        onSyncStock={handleSyncStock}
        onImportCatalog={handleImportCatalog}
      />

      {/* Вебхуки заказов и товаров */}
      <WooWebhooksCard
        orderWebhookUrl={orderWebhookUrl}
        productWebhookUrl={productWebhookUrl}
      />

      {/* Форма настроек WooCommerce API */}
      <WooSettingsForm
        tenantId={tenantId}
        tenant={tenant}
        onTenantUpdated={onTenantUpdated}
        onSettingsSaved={handlePing}
      />
    </div>
  );
};
