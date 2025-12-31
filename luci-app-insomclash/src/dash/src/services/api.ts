import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import type { ApiResponse, MihomoStatus, AppConfig, DashboardInfo } from '../types';


class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new Error(error instanceof Error ? error.message : 'Network error');
  }
}

export const mihomoApi = {
  async getStatus(): Promise<MihomoStatus> {
    const response = await fetchApi<MihomoStatus>(API_ENDPOINTS.mihomo.status);
    return response.data || { running: false };
  },

  async start(): Promise<void> {
    await fetchApi(API_ENDPOINTS.mihomo.start, { method: 'POST' });
  },

  async stop(): Promise<void> {
    await fetchApi(API_ENDPOINTS.mihomo.stop, { method: 'POST' });
  },

  async restart(): Promise<void> {
    await fetchApi(API_ENDPOINTS.mihomo.restart, { method: 'POST' });
  },

  async getMemory(): Promise<{ inuse: number; oslimit: number }> {

    const response = await fetchApi<{ inuse: number; oslimit: number }>(API_ENDPOINTS.mihomo.memory);
    return response.data || { inuse: 0, oslimit: 0 };
  },

  async getTraffic(): Promise<{ up: number; down: number }> {
    const response = await fetchApi<{ up: number; down: number }>(API_ENDPOINTS.mihomo.traffic);
    return response.data || { up: 0, down: 0 };
  },

  async getConnections(): Promise<{ total: number; uploadTotal: number; downloadTotal: number }> {
    const response = await fetchApi<{ total: number; uploadTotal: number; downloadTotal: number }>(API_ENDPOINTS.mihomo.connections);
    return response.data || { total: 0, uploadTotal: 0, downloadTotal: 0 };
  },

  async getIPInfo(): Promise<{ ipv4: string; ipv6: string }> {
    try {
      const [ipv4Response, ipv6Response] = await Promise.allSettled([
        fetchApi<{
          ip: string;
          country: string;
          organization: string;
          city: string;
        }>(API_ENDPOINTS.app.geoIpv4),
        fetchApi<{
          ip: string;
          country: string;
          organization: string;
          city: string;
        }>(API_ENDPOINTS.app.geoIpv6)
      ]);

      const ipv4 = ipv4Response.status === 'fulfilled' && ipv4Response.value.data
        ? `${ipv4Response.value.data.country} ${ipv4Response.value.data.organization} (${ipv4Response.value.data.ip})`
        : '';

      const ipv6 = ipv6Response.status === 'fulfilled' && ipv6Response.value.data
        ? `${ipv6Response.value.data.country} ${ipv6Response.value.data.organization} (${ipv6Response.value.data.ip})`
        : '';

      return { ipv4, ipv6 };
    } catch {
      return { ipv4: '', ipv6: '' };
    }
  },

  async getCoreVersion(): Promise<string> {
    try {
      const response = await fetchApi<{ version: string }>(API_ENDPOINTS.mihomo.coreVersion);
      return response.data?.version || 'Unknown';
    } catch {
      return 'Unknown';
    }
  },

  async getActiveConfig(): Promise<string> {
    try {
      const response = await fetchApi<{ active_config: string }>(API_ENDPOINTS.mihomo.activeConfig);
      if (response.success && response.data) {
        return response.data.active_config || '';
      }
      return '';
    } catch {
      return '';
    }
  },

  async setActiveConfig(filename: string): Promise<void> {
    await fetchApi(API_ENDPOINTS.mihomo.activeConfig, {
      method: 'PUT',
      body: JSON.stringify({ filename }),
    });
  },

  async getConfigs(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.mihomo.configs}`);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching configs:', error);
      return [];
    }
  },

  async clearMihomoLogs(): Promise<void> {
    await fetchApi(API_ENDPOINTS.logs.mihomo, { method: 'DELETE' });
  },

  async clearAppLogs(): Promise<void> {
    await fetchApi(API_ENDPOINTS.logs.app, { method: 'DELETE' });
  },

  async getDashboardInfo(): Promise<DashboardInfo> {
    const response = await fetchApi<DashboardInfo>(API_ENDPOINTS.mihomo.dashboardInfo);
    return response.data || { port: '9090', secret: '', dashboards: [] };
  },
};


export const configApi = {
  async getConfig(): Promise<AppConfig> {
    const response = await fetchApi<AppConfig>(API_ENDPOINTS.app.config);
    return response.data || { version: '0.0.0', environment: 'development' };
  },
};
