import { useState } from 'react';
import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { useMihomoStatus } from '../../hooks/useMihomoStatus';
import { mihomoApi } from '../../services/api';

export function ControlPanel() {
  const { status, refetch } = useMihomoStatus();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    setLoading(action);
    setError(null);

    try {
      if (action === 'start') {
        await mihomoApi.start();
      } else if (action === 'stop') {
        await mihomoApi.stop();
      } else {
        await mihomoApi.restart();
      }
      
      setTimeout(() => {
        refetch();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} service`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 shadow-soft-lg">
      <VStack align="stretch" gap={4}>
        <div>
          <Text className="text-sm font-medium opacity-70 mb-1">Service Control</Text>
          <Text fontSize="xl" fontWeight="bold">
            Control Panel
          </Text>
        </div>

        {error && (
          <div className="bg-gradient-danger rounded-xl p-4 text-white shadow-soft">
            <Text className="text-sm">{error}</Text>
          </div>
        )}

        <HStack gap={3} className="pt-2">
          <Button
            colorPalette="green"
            onClick={() => handleAction('start')}
            loading={loading === 'start'}
            disabled={status?.running || loading !== null}
            className="flex-1 bg-gradient-success text-white shadow-soft hover:shadow-soft-lg transition-all"
          >
            Start
          </Button>

          <Button
            colorPalette="red"
            onClick={() => handleAction('stop')}
            loading={loading === 'stop'}
            disabled={!status?.running || loading !== null}
            className="flex-1 bg-gradient-danger text-white shadow-soft hover:shadow-soft-lg transition-all"
          >
            Stop
          </Button>

          <Button
            colorPalette="blue"
            onClick={() => handleAction('restart')}
            loading={loading === 'restart'}
            disabled={!status?.running || loading !== null}
            className="flex-1 bg-gradient-info text-white shadow-soft hover:shadow-soft-lg transition-all"
          >
            Restart
          </Button>
        </HStack>
      </VStack>
    </div>
  );
}
