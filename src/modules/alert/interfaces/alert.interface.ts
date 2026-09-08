export type AlertLevel = 'CRITICAL' | 'WARNING' | 'INFO';

export type AlertSource =
  | 'mariadb'
  | 'bullmq'
  | 'prom'
  | 'rozetka'
  | 'woocommerce'
  | 'horoshop'
  | 'system';

export interface AlertPayload {
  level: AlertLevel;
  source: AlertSource;
  tenantId?: string;
  title: string;
  message: string;
  errorDetails?: string;
  context?: Record<string, unknown>;
  timestamp?: Date;
}

export interface ThrottledAlertRecord {
  firstSeenAt: number;
  lastSentAt: number;
  count: number;
}
