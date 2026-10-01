import type { TenantData } from '@/components/admin/TenantModal';

export interface RozetkaTabProps {
  tenantId: string;
  tenant: TenantData;
  onTenantUpdated: () => void;
}

export interface RozetkaPingStatus {
  loading: boolean;
  success?: boolean;
  message?: string;
}

export interface RozetkaSyncReport {
  success: boolean;
  message: string;
  updated?: number;
}
