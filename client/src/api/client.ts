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
          const isLoginPage =
            typeof window !== 'undefined' &&
            window.location.pathname.startsWith('/login');

          if (!isLoginPage) {
            const role = sessionStorage.getItem('liman_role');
            const tenantId = sessionStorage.getItem('liman_tenant_id');

            // Очищаем сессию и редиректим на login
            sessionStorage.removeItem('liman_api_key');
            sessionStorage.removeItem('liman_role');
            sessionStorage.removeItem('liman_tenant_id');
            if (typeof window !== 'undefined') {
              const redirectParams = new URLSearchParams({ reason: 'session_expired' });
              if (role) redirectParams.set('role', role);
              if (tenantId) redirectParams.set('tenant', tenantId);
              window.location.href = `/login?${redirectParams.toString()}`;
            }
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
  get: (id: string) => apiClient.get(`/tenants/${id}`),
  create: (data: unknown) => apiClient.post('/admin/tenants', data),
  update: (id: string, data: unknown) => apiClient.patch(`/tenants/${id}`, data),
  delete: (id: string) => apiClient.delete(`/admin/tenants/${id}`),
  ping: (id: string) => apiClient.get(`/liman/${id}/ping`),
  revealCredentials: (id: string) =>
    apiClient.post(`/tenants/${id}/reveal-credentials`),
  rotateKey: (id: string) => apiClient.post(`/admin/tenants/${id}/rotate-key`),
};

export const adminApi = {
  getOverview: () => apiClient.get('/admin/overview'),
  getQueues: () => apiClient.get('/admin/queues'),
  retryFailedQueues: (queueName: string) =>
    apiClient.post(`/admin/queues/${queueName}/retry-failed`),
};

export const syncApi = {
  getJobStatus: (queueName: string, jobId: string) =>
    apiClient.get(`/sync/jobs/${queueName}/${jobId}`),
};

export const horoshopApi = {
  ping: (tenantId: string) => apiClient.get(`/horoshop/${tenantId}/ping`),
  syncPricesStocks: (tenantId: string, limit?: number) =>
    apiClient.post(`/horoshop/${tenantId}/sync/prices-stocks${limit ? `?limit=${limit}` : ''}`),
  syncPricesStocksAsync: (tenantId: string) =>
    apiClient.post(`/horoshop/${tenantId}/sync/prices-stocks?async=true`),
  getActivity: (tenantId: string) => apiClient.get(`/horoshop/${tenantId}/activity`),
  saveSettings: (tenantId: string, data: unknown) =>
    apiClient.patch(`/tenants/${tenantId}`, data),
  importCatalog: (
    tenantId: string,
    payload: {
      mode: 'only_new' | 'overwrite';
      updatePrices?: boolean;
      updateStock?: boolean;
      updateImages?: boolean;
      createBackup?: boolean;
      limit?: number;
    },
  ) => apiClient.post(`/horoshop/${tenantId}/import/catalog`, payload),
  exportCatalog: (
    tenantId: string,
    payload: {
      mode?: 'full_overwrite' | 'only_new' | 'update_existing';
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
    },
  ) => apiClient.post(`/horoshop/${tenantId}/export/catalog`, payload),
  getExportCategories: (tenantId: string) =>
    apiClient.get<{
      success: boolean;
      categories: Array<{ id: number; title: string; fullPath: string }>;
    }>(`/horoshop/${tenantId}/export/categories`),
};

export const promApi = {
  ping: (tenantId: string) => apiClient.get(`/prom/${tenantId}/ping`),
  syncPricesStocks: (tenantId: string, limit?: number) =>
    apiClient.post(`/prom/${tenantId}/sync/prices-stocks${limit ? `?limit=${limit}` : ''}`),
  syncPricesStocksAsync: (tenantId: string) =>
    apiClient.post(`/prom/${tenantId}/sync/prices-stocks?async=true`),
  syncStock: (tenantId: string) =>
    apiClient.post(`/prom/${tenantId}/sync/prices-stocks?async=true`),
  syncOrders: (tenantId: string) =>
    apiClient.post(`/prom/${tenantId}/sync/orders`),
  getActivity: (tenantId: string) =>
    apiClient.get(`/prom/${tenantId}/activity`),
  getMappingStats: (tenantId: string, integrationId?: string) =>
    apiClient.get(`/prom/${tenantId}/mappings/stats${integrationId ? `?integrationId=${integrationId}` : ''}`),
  importCatalog: (
    tenantId: string,
    payload: {
      mode: 'only_new' | 'overwrite';
      updatePrices?: boolean;
      updateStock?: boolean;
      updateImages?: boolean;
      createBackup?: boolean;
      limit?: number;
    },
  ) => apiClient.post(`/prom/${tenantId}/import/catalog`, payload),
  exportCatalog: (
    tenantId: string,
    payload: {
      mode?: 'full_overwrite' | 'only_new' | 'update_existing';
      exportPrices?: boolean;
      exportStock?: boolean;
      exportDescriptions?: boolean;
      exportImages?: boolean;
      exportCategories?: boolean;
      defaultGroupId?: number;
      currency?: string;
      baseUrl?: string;
      limit?: number;
    },
  ) => apiClient.post(`/prom/${tenantId}/export/catalog`, payload),
  getExportCategories: (tenantId: string) =>
    apiClient.get<{
      success: boolean;
      categories: Array<{ id: number; name: string; parentId: number | null }>;
    }>(`/prom/${tenantId}/export/categories`),
  getProducts: (
    tenantId: string,
    params?: { limit?: number; last_id?: number; group_id?: number },
  ) => apiClient.get(`/prom/${tenantId}/products`, { params }),
  getOrders: (tenantId: string, status?: string) =>
    apiClient.get(`/prom/${tenantId}/orders`, { params: { status } }),
};

export const rozetkaApi = {
  ping: (tenantId: string) => apiClient.get(`/rozetka/${tenantId}/ping`),
  syncPricesStocks: (tenantId: string) =>
    apiClient.post(`/rozetka/${tenantId}/sync/prices-stocks`),
};

export const woocommerceApi = {
  ping: (tenantId: string) => apiClient.get(`/woocommerce/${tenantId}/ping`),
  syncStock: (tenantId: string) =>
    apiClient.post(`/woocommerce/${tenantId}/sync/stock`),
  syncProducts: (tenantId: string) =>
    apiClient.post(`/woocommerce/${tenantId}/sync/products?limit=50`),
  importCatalog: (tenantId: string) =>
    apiClient.post(`/woocommerce/${tenantId}/import/catalog`),
  getPluginDownloadUrl: (tenantId: string) =>
    `/api/v1/woocommerce/${tenantId}/plugin/download`,
};

/**
 * Алиас для обратной совместимости — используется в PromTab и тестах.
 * ping проверяет соединение с БД тенанта через /liman/:id/ping.
 */
export const limanApi = {
  ping: tenantsApi.ping,
};

