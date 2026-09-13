export const QUEUE_NAMES = {
  EXPORT_CATALOG: 'export-catalog',
  SYNC_STOCK: 'sync-stock',
  IMPORT_ORDERS: 'import-orders',
  IMPORT_WOO_CATALOG: 'import-woo-catalog',
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
  targetPlatform: 'prom' | 'rozetka' | 'woocommerce';
}

export interface ImportWooCatalogJobData {
  tenantId: string;
  limit?: number;
  page?: number;
}
