import React from 'react';

export interface PromTenantSettings {
  promShopTitle?: string;
  promApiKey?: string;
  promExportEnabled?: boolean;
  promSyncIntervalMinutes?: number;
  promOrderWebhookEnabled?: boolean;
  promCreateOrderDocumentEnabled?: boolean;
  [key: string]: unknown;
}

export interface PromTabProps {
  tenantId: string;
  tenant: PromTenantSettings | null | undefined;
  onTenantUpdated: () => void;
}

export interface MariaDbStatus {
  loading: boolean;
  success?: boolean;
  pingMs?: number;
}

export interface PromStatus {
  loading: boolean;
  success?: boolean;
  shopTitle?: string;
  message?: string;
}

export interface SyncReport {
  success: boolean;
  message: string;
}
