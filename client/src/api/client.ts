import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

/**
 * Создает Axios-инстанс с автоматическим добавлением заголовка x-api-key
 * и централизованной обработкой 401/403 ошибок.
 */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: '/api/v1',
    timeout: 30_000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor: добавляем API ключ из sessionStorage / localStorage
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const key =
      sessionStorage.getItem('liman_api_key') ?? localStorage.getItem('liman_api_key');
    if (key) {
      config.headers['x-api-key'] = key;
    }
    return config;
  });

  // Response interceptor: перехват 401 / 403
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          // Очищаем сессию и редиректим на login
          sessionStorage.removeItem('liman_api_key');
          sessionStorage.removeItem('liman_role');
          sessionStorage.removeItem('liman_tenant_id');
          if (typeof window !== 'undefined') {
            window.location.href = '/login?reason=session_expired';
          }
        }
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export const apiClient = createApiClient();

// ─── Typed API helpers ────────────────────────────────────────────────────────

export const backupApi = {
  create: (tenantId: string, mode: 'fast' | 'full') =>
    apiClient.post(`/liman/${tenantId}/backups`, { mode }),

  list: (tenantId: string) =>
    apiClient.get(`/liman/${tenantId}/backups`),

  restore: (tenantId: string, filename: string) =>
    apiClient.post(`/liman/${tenantId}/backups/${filename}/restore`, { confirmed: true }),

  download: (tenantId: string, filename: string) =>
    apiClient.get(`/liman/${tenantId}/backups/${filename}/download`, {
      responseType: 'blob',
    }),

  delete: (tenantId: string, filename: string) =>
    apiClient.delete(`/liman/${tenantId}/backups/${filename}`),
};

export const tenantsApi = {
  list: () => apiClient.get('/admin/tenants'),
  get: (id: string) => apiClient.get(`/admin/tenants/${id}`),
  create: (data: unknown) => apiClient.post('/admin/tenants', data),
  update: (id: string, data: unknown) => apiClient.patch(`/admin/tenants/${id}`, data),
  delete: (id: string) => apiClient.delete(`/admin/tenants/${id}`),
  ping: (id: string) => apiClient.get(`/liman/${id}/ping`),
  revealCredentials: (id: string) =>
    apiClient.post(`/admin/tenants/${id}/reveal-credentials`),
  rotateKey: (id: string) => apiClient.post(`/admin/tenants/${id}/rotate-key`),
};

export const adminApi = {
  getOverview: () => apiClient.get('/admin/overview'),
  getQueues: () => apiClient.get('/admin/queues'),
  retryFailedQueues: (queueName: string) =>
    apiClient.post(`/admin/queues/${queueName}/retry-failed`),
};

export const horoshopApi = {
  ping: (tenantId: string) => apiClient.get(`/horoshop/${tenantId}/ping`),
  syncPricesStocks: (tenantId: string, limit?: number) =>
    apiClient.post(`/horoshop/${tenantId}/sync/prices-stocks${limit ? `?limit=${limit}` : ''}`),
  getActivity: (tenantId: string) => apiClient.get(`/horoshop/${tenantId}/activity`),
  saveSettings: (tenantId: string, data: unknown) =>
    apiClient.patch(`/admin/tenants/${tenantId}`, data),
  importCatalog: (
    tenantId: string,
    payload: {
      mode: 'only_new' | 'overwrite';
      updatePrices?: boolean;
      updateStock?: boolean;
      updateImages?: boolean;
      createBackup?: boolean;
    },
  ) => apiClient.post(`/horoshop/${tenantId}/import/catalog`, payload),
};
