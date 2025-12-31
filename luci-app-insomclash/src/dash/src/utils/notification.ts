import { toaster } from '../components/ui/toaster';

type NotificationType = 'success' | 'error' | 'info' | 'warning' | 'loading';

interface NotificationOptions {
  title?: string;
  description?: string;
  duration?: number;
  closable?: boolean;
}

export const showNotification = (
  type: NotificationType,
  message: string,
  options?: NotificationOptions
) => {
  const { title, description, duration = 5000, closable = true } = options || {};
  
  return toaster.create({
    type,
    title: title || message,
    description: description,
    duration,
    closable,
  });
};

export const showSuccess = (message: string, options?: NotificationOptions) => {
  return showNotification('success', message, options);
};

export const showError = (message: string, options?: NotificationOptions) => {
  return showNotification('error', message, options);
};

export const showInfo = (message: string, options?: NotificationOptions) => {
  return showNotification('info', message, options);
};

export const showWarning = (message: string, options?: NotificationOptions) => {
  return showNotification('warning', message, options);
};

export const showLoading = (message: string, options?: NotificationOptions) => {
  const { duration = 0, ...rest } = options || {};
  return showNotification('loading', message, { duration, ...rest });
};

export const dismissNotification = (id: string) => {
  toaster.dismiss(id);
};

export const dismissAllNotifications = () => {
};
