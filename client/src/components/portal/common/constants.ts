export const SYNC_MODAL_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export type SyncModalStatus =
  (typeof SYNC_MODAL_STATUS)[keyof typeof SYNC_MODAL_STATUS];
