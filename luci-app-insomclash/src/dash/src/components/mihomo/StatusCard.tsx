import { Text, HStack, Badge, VStack } from '@chakra-ui/react';
import { useMihomoStatus } from '../../hooks/useMihomoStatus';
import { formatDistanceToNow } from 'date-fns';

export function StatusCard() {
  const { status, loading, error } = useMihomoStatus();

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 shadow-soft-lg">
        <Text>Loading...</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-6 shadow-soft-lg border-l-4 border-red-500">
        <Text className="text-red-500">{error}</Text>
      </div>
    );
  }

  const uptime = status?.uptime
    ? formatDistanceToNow(new Date(Date.now() - status.uptime * 1000), { addSuffix: true })
    : 'N/A';

  return (
    <div className="gradient-card rounded-2xl p-6 shadow-soft-xl overflow-hidden relative">
      <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl opacity-30 ${
        status?.running ? 'bg-green-400' : 'bg-red-400'
      }`} />
      
      <VStack align="stretch" gap={4} className="relative z-10">
        <HStack justify="space-between">
          <div>
            <Text className="text-sm font-medium opacity-70 mb-1">Service Status</Text>
            <Text fontSize="2xl" fontWeight="bold" className="bg-gradient-info bg-clip-text text-transparent">
              Mihomo Core
            </Text>
          </div>
          <Badge 
            colorPalette={status?.running ? 'green' : 'red'}
            className="px-4 py-2 rounded-full shadow-soft"
          >
            {status?.running ? 'Running' : 'Stopped'}
          </Badge>
        </HStack>

        {status?.running && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10 dark:border-gray-700/30">
            {status.version && (
              <div className="space-y-1">
                <Text className="text-xs font-medium opacity-60">Version</Text>
                <Text className="font-semibold">{status.version}</Text>
              </div>
            )}
            <div className="space-y-1">
              <Text className="text-xs font-medium opacity-60">Uptime</Text>
              <Text className="font-semibold">{uptime}</Text>
            </div>
            {status.memory !== undefined && (
              <div className="space-y-1">
                <Text className="text-xs font-medium opacity-60">Memory</Text>
                <Text className="font-semibold">{(status.memory / 1024 / 1024).toFixed(2)} MB</Text>
              </div>
            )}
            {status.cpu !== undefined && (
              <div className="space-y-1">
                <Text className="text-xs font-medium opacity-60">CPU</Text>
                <Text className="font-semibold">{status.cpu.toFixed(2)}%</Text>
              </div>
            )}
          </div>
        )}
      </VStack>
    </div>
  );
}
