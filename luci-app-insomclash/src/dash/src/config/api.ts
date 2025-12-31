const envApiUrl = import.meta.env.VITE_API_BASE_URL;
export const API_BASE_URL = envApiUrl || '';
const envWsUrl = import.meta.env.VITE_WS_BASE_URL;
export const WS_BASE_URL = envWsUrl || `ws://${window.location.host}`;

export const API_ENDPOINTS = {
  mihomo: {
    status: '/api/v1/mihomo/status',
    start: '/api/v1/mihomo/start',
    stop: '/api/v1/mihomo/stop',
    restart: '/api/v1/mihomo/restart',
    memory: '/api/v1/mihomo/memory',
    traffic: '/api/v1/mihomo/traffic',
    connections: '/api/v1/mihomo/connections',
    coreVersion: '/api/v1/mihomo/core-version',
    configs: '/api/v1/mihomo/configs',
    configFile: (filename: string) => `/api/v1/mihomo/configs/${filename}`,
    configRename: (filename: string) => `/api/v1/mihomo/configs/${filename}/rename`,
    activeConfig: '/api/v1/mihomo/active-config',
    proxyProviders: '/api/v1/mihomo/proxy-providers',
    proxyProviderFile: (filename: string) => `/api/v1/mihomo/proxy-providers/${filename}`,
    proxyProviderRename: (filename: string) => `/api/v1/mihomo/proxy-providers/${filename}/rename`,
    proxyProviderDownload: (filename: string) => `/api/v1/mihomo/proxy-providers/${filename}/download`,
    proxyProviderUpload: '/api/v1/mihomo/proxy-providers/upload',
    ruleProviders: '/api/v1/mihomo/rule-providers',
    ruleProviderFile: (filename: string) => `/api/v1/mihomo/rule-providers/${filename}`,
    ruleProviderRename: (filename: string) => `/api/v1/mihomo/rule-providers/${filename}/rename`,
    ruleProviderDownload: (filename: string) => `/api/v1/mihomo/rule-providers/${filename}/download`,
    ruleProviderUpload: '/api/v1/mihomo/rule-providers/upload',
    dashboardInfo: '/api/v1/mihomo/dashboard-info',
  },
  app: {
    config: '/api/v1/app/config',
    ipv4: '/api/v1/app/ipv4',
    ipv6: '/api/v1/app/ipv6',
    geoIpv4: '/api/v1/app/geo/ipv4',
    geoIpv6: '/api/v1/app/geo/ipv6',
  },
  logs: {
    mihomo: '/api/v1/mihomo/logs',
    app: '/api/v1/app/logs',
  },
};

export const POLLING_INTERVAL = 5000;

