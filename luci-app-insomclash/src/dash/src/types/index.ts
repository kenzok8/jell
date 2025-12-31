export type ThemeMode = 'light' | 'dark' | 'system';

export type ColorScheme =
  | 'dracula'
  | 'dracula-soft'
  | 'dracula-pro'
  | 'tokyo-night'
  | 'tokyo-night-storm'
  | 'tokyo-night-light'
  | 'nord'
  | 'monokai'
  | 'monokai-pro'
  | 'gruvbox-dark'
  | 'gruvbox-light'
  | 'catppuccin-mocha'
  | 'catppuccin-macchiato'
  | 'catppuccin-frappe'
  | 'catppuccin-latte'
  | 'one-dark'
  | 'one-light'
  | 'palenight'
  | 'material-theme'
  | 'material-ocean'
  | 'material-darker'
  | 'material-palenight'
  | 'solarized-dark'
  | 'solarized-light'
  | 'everforest'
  | 'ayu-dark'
  | 'ayu-mirage'
  | 'ayu-light';

export interface MihomoStatus {
  running: boolean;
  uptime?: number;
  version?: string;
  memory?: number;
  cpu?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface AppConfig {
  version: string;
  environment: string;
}

export interface DashboardInfo {
  port: string;
  secret: string;
  dashboards: string[];
}

export interface MihomoLog {
  level: string;
  message: string;
  timestamp: string;
}