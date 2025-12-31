import { useState, useEffect } from 'react';
import { mihomoApi } from '../services/api';
import type { MihomoStatus } from '../types';
import { POLLING_INTERVAL } from '../config/api';

export function useMihomoStatus(autoRefresh = true) {
  const [status, setStatus] = useState<MihomoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await mihomoApi.getStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    if (autoRefresh) {
      const interval = setInterval(fetchStatus, POLLING_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const refetch = () => {
    setLoading(true);
    fetchStatus();
  };

  return { status, loading, error, refetch };
}
