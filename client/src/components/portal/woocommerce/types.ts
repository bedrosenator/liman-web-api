import type { TenantData } from '@/components/admin/TenantModal';

export interface WooCommerceTabProps {
  tenantId: string;
  tenant: TenantData;
  onTenantUpdated: () => void;
}

export interface WooPingStatus {
  loading: boolean;
  success?: boolean;
  message?: string;
}

export interface WooActionReport {
  success: boolean;
  message: string;
}
