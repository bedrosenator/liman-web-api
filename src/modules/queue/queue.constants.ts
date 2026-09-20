export const QUEUE_NAMES = {
  EXPORT_CATALOG: 'export-catalog',
  SYNC_STOCK: 'sync-stock',
  IMPORT_ORDERS: 'import-orders',
  IMPORT_WOO_CATALOG: 'import-woo-catalog',
  IMPORT_HOROSHOP_CATALOG: 'import-horoshop-catalog',
  EXPORT_HOROSHOP_CATALOG: 'export-horoshop-catalog',
  IMPORT_PROM_CATALOG: 'import-prom-catalog',
  EXPORT_PROM_CATALOG: 'export-prom-catalog',
} as const;

export interface ExportChunkJobData {
  tenantId: string;
  chunkIndex: number;
  totalChunks: number;
  tcods: number[];
  targetPlatform: 'prom' | 'rozetka' | 'woocommerce';
}

export interface SyncStockJobData {
  tenantId: string;
  targetPlatform: 'prom' | 'rozetka' | 'woocommerce' | 'horoshop';
  integrationId?: string;
  limit?: number;
}

export interface ImportWooCatalogJobData {
  tenantId: string;
  limit?: number;
  page?: number;
}

export interface ImportHoroshopCatalogJobData {
  tenantId: string;
  integrationId?: string;
  mode?: 'only_new' | 'overwrite';
  updatePrices?: boolean;
  updateStock?: boolean;
  updateImages?: boolean;
  createBackup?: boolean;
  limit?: number;
}

export interface ExportHoroshopCatalogJobData {
  tenantId: string;
  integrationId?: string;
  mode?: 'only_new' | 'update_existing' | 'full_overwrite';
  exportPrices?: boolean;
  exportStock?: boolean;
  exportDescriptions?: boolean;
  exportImages?: boolean;
  exportCategories?: boolean;
  defaultCategoryPath?: string;
  defaultBrand?: string;
  currency?: string;
  baseUrl?: string;
  limit?: number;
}

export interface ImportPromCatalogJobData {
  tenantId: string;
  integrationId?: string;
  mode?: 'only_new' | 'overwrite';
  updatePrices?: boolean;
  updateStock?: boolean;
  updateImages?: boolean;
  createBackup?: boolean;
  limit?: number;
}

export interface ExportPromCatalogJobData {
  tenantId: string;
  integrationId?: string;
  mode?: 'only_new' | 'update_existing' | 'full_overwrite';
  exportPrices?: boolean;
  exportStock?: boolean;
  exportDescriptions?: boolean;
  exportImages?: boolean;
  exportCategories?: boolean;
  defaultGroupId?: number;
  defaultCategoryPath?: string;
  defaultBrand?: string;
  currency?: string;
  baseUrl?: string;
  limit?: number;
}

