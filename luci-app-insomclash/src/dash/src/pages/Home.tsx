import { Box, Button, HStack, VStack, Heading, Text, Menu } from '@chakra-ui/react';
import { Server, Users, Activity, Play, Square, RotateCw, Settings, ExternalLink, ChevronDown } from 'lucide-react';
import { showSuccess, showError } from '../utils/notification';
import { StatsCard } from '../components/common/StatsCard';
import { Chart, useChart } from '@chakra-ui/charts';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { useMihomoStatus } from '../hooks/useMihomoStatus';
import { useMihomoStats } from '../hooks/useMihomoStats';
import { useState, useEffect } from 'react';
import { mihomoApi } from '../services/api';
import { AppConfigDrawer } from '../components/AppConfigDrawer';
import type { DashboardInfo } from '../types';

export function Home() {
  const { status, refetch } = useMihomoStatus();
  const { stats, history } = useMihomoStats();
  const [loading, setLoading] = useState<string | null>(null);
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);
  const [dashboardInfo, setDashboardInfo] = useState<DashboardInfo | null>(null);

  useEffect(() => {
    const fetchDashboardInfo = async () => {
      try {
        const info = await mihomoApi.getDashboardInfo();
        setDashboardInfo(info);
      } catch (error) {
        console.error('Failed to fetch dashboard info:', error);
      }
    };
    fetchDashboardInfo();
  }, []);


  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'kB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'kB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return `${(bytesPerSecond / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatYAxisSpeed = (value: number): string => {
    if (value === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'kB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(value) / Math.log(k));
    const formatted = (value / Math.pow(k, i)).toFixed(0);
    return `${formatted} ${sizes[i]}`;
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    setLoading(action);
    try {
      if (action === 'start') {
        await mihomoApi.start();
        showSuccess('Service Started', { description: 'Mihomo service has been started successfully' });
      } else if (action === 'stop') {
        await mihomoApi.stop();
        showSuccess('Service Stopped', { description: 'Mihomo service has been stopped successfully' });
      } else {
        await mihomoApi.restart();
        showSuccess('Service Restarted', { description: 'Mihomo service has been restarted successfully' });
      }
      setTimeout(() => refetch(), 1000);
    } catch (err) {
      console.error(err);
      showError(`Failed to ${action} service`, {
        description: err instanceof Error ? err.message : 'An unknown error occurred'
      });
    } finally {
      setLoading(null);
    }
  };

  const buildDashboardUrl = (dashboard: string): string => {
    if (!dashboardInfo) return '';

    const hostname = window.location.hostname;
    const port = dashboardInfo.port;
    const secret = dashboardInfo.secret;

    return `http://${hostname}:${port}/ui/${dashboard}/?hostname=${hostname}&port=${port}&secret=${secret}`;
  };

  const chartData = history.map((item, index) => ({
    name: index.toString(),
    download: item.downloadSpeed,
    upload: item.uploadSpeed,
  }));

  const chart = useChart({
    data: chartData.length > 0 ? chartData : [{ name: '0', download: 0, upload: 0 }],
    series: [
      { name: 'download', color: 'cyan.solid' },
      { name: 'upload', color: 'purple.solid' },
    ],
  });

  return (
    <VStack align="stretch" gap={{ base: 4, md: 6 }}>
      <HStack justify="space-between" align="center">
        <Box>
          <Heading size={{ base: 'xl', md: '2xl' }} mb={2} color="#00d4ff">
            FusionTunX
          </Heading>
          <Text fontSize={{ base: 'sm', md: 'md' }} color="gray.500">
            Freedom-focused high-performance tunneling.
          </Text>
        </Box>
        <HStack gap={2}>
          {status?.running && dashboardInfo && dashboardInfo.dashboards.length > 0 && (
            <Menu.Root>
              <Menu.Trigger asChild>
                <Button
                  size="sm"
                  variant="solid"
                  colorPalette="cyan"
                >
                  <ExternalLink size={16} />
                  Dashboard
                  <ChevronDown size={14} />
                </Button>
              </Menu.Trigger>
              <Menu.Positioner>
                <Menu.Content>
                  {dashboardInfo.dashboards.map((dashboard) => (
                    <Menu.Item
                      key={dashboard}
                      value={dashboard}
                      onClick={() => window.open(buildDashboardUrl(dashboard), '_blank')}
                    >
                      {dashboard.charAt(0).toUpperCase() + dashboard.slice(1)}
                    </Menu.Item>
                  ))}
                </Menu.Content>
              </Menu.Positioner>
            </Menu.Root>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsConfigDrawerOpen(true)}
          >
            <Settings size={16} style={{ marginRight: '8px' }} />
            App Config
          </Button>
        </HStack>
      </HStack>


      {/* Stats Cards */}
      <Box display="grid" gridTemplateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={{ base: 3, md: 4 }}>
        <StatsCard
          title="Service Status"
          value={status?.running ? 'Running' : 'Stopped'}
          icon={Server}
          color="purple"
        />
        <StatsCard
          title="Connections"
          value={stats.connections.toString()}
          icon={Activity}
          color="green"
        />
        <StatsCard
          title="Memory Usage"
          value={stats.memory > 0 ? `${(stats.memory / 1024 / 1024).toFixed(0)} MB` : '0 MB'}
          icon={Users}
          color="cyan"
        />
      </Box>

      <Box
        bg="bg.surface"
        p={{ base: 4, md: 6 }}
        borderRadius="lg"
        borderWidth="1px"
        borderColor="border.DEFAULT"
      >
        <VStack align="stretch" gap={{ base: 3, md: 6 }}>
          <HStack justify="space-between" align="start" flexWrap={{ base: 'wrap', md: 'nowrap' }} gap={3}>
            <VStack align="start" gap={1} flex={1}>
              <Heading size={{ base: 'md', md: 'lg' }}>
                Service Control
              </Heading>
              <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.500">
                Manage Mihomo service operations
              </Text>
            </VStack>
            <HStack gap={2} flexWrap="wrap">
              <Button
                size={{ base: 'xs', md: 'sm' }}
                onClick={() => handleAction('start')}
                loading={loading === 'start'}
                disabled={status?.running || loading !== null}
                colorPalette="green"
              >
                <Play size={14} />
                Start
              </Button>
              <Button
                size={{ base: 'xs', md: 'sm' }}
                onClick={() => handleAction('stop')}
                loading={loading === 'stop'}
                disabled={!status?.running || loading !== null}
                colorPalette="red"
              >
                <Square size={14} />
                Stop
              </Button>
              <Button
                size={{ base: 'xs', md: 'sm' }}
                onClick={() => handleAction('restart')}
                loading={loading === 'restart'}
                disabled={!status?.running || loading !== null}
                colorPalette="purple"
              >
                <RotateCw size={14} />
                Restart
              </Button>
            </HStack>
          </HStack>
        </VStack>
      </Box>

      <Box
        bg="bg.surface"
        p={{ base: 4, md: 6 }}
        borderRadius="lg"
        borderWidth="1px"
        borderColor="border.DEFAULT"
      >
        <Heading size={{ base: 'md', md: 'lg' }} mb={4}>
          Network Statistics
        </Heading>
        <VStack align="stretch" gap={4}>
          <Box display="grid" gridTemplateColumns={{ base: '1fr', md: 'repeat(4, 1fr)' }} gap={4}>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">Download</Text>
              <Text fontSize="lg" fontWeight="bold">
                {formatBytes(stats.traffic.down)}
              </Text>
            </VStack>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">DL Speed</Text>
              <Text fontSize="lg" fontWeight="bold">
                {formatSpeed(stats.speed.download)}
              </Text>
            </VStack>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">Upload</Text>
              <Text fontSize="lg" fontWeight="bold">
                {formatBytes(stats.traffic.up)}
              </Text>
            </VStack>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">UL Speed</Text>
              <Text fontSize="lg" fontWeight="bold">
                {formatSpeed(stats.speed.upload)}
              </Text>
            </VStack>
          </Box>

          <Box borderTopWidth="1px" borderColor="border.DEFAULT" pt={4}>
            <VStack align="stretch" gap={3}>
              <HStack gap={2}>
                <Text fontSize="sm" fontWeight="medium" color="fg.muted" minW="60px">
                  IPv4:
                </Text>
                <Text fontSize="sm">
                  {stats.ipInfo.ipv4 || 'N/A'}
                </Text>
              </HStack>
              <HStack gap={2}>
                <Text fontSize="sm" fontWeight="medium" color="fg.muted" minW="60px">
                  IPv6:
                </Text>
                <Text fontSize="sm">
                  {stats.ipInfo.ipv6 || 'N/A'}
                </Text>
              </HStack>
            </VStack>
          </Box>
        </VStack>
      </Box>

      <Box
        bg="bg.surface"
        p={{ base: 4, md: 6 }}
        borderRadius="lg"
        borderWidth="1px"
        borderColor="border.DEFAULT"
      >
        <Heading size={{ base: 'md', md: 'lg' }} mb={4}>
          Network Speed
        </Heading>
        <Chart.Root maxH="sm" chart={chart}>
          <AreaChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#6272a4" opacity={0.3} vertical={false} />
            <XAxis
              dataKey={chart.key('name')}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6272a4' }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6272a4' }}
              tickFormatter={formatYAxisSpeed}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                return (
                  <Box
                    bg="bg.panel"
                    p={3}
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="border.DEFAULT"
                  >
                    <Text fontSize="sm" mb={2}>{payload[0].payload.name}</Text>
                    {payload.map((entry: any) => (
                      <HStack key={entry.name} gap={2}>
                        <Box w={3} h={3} bg={entry.color} borderRadius="full" />
                        <Text fontSize="sm" color="fg.muted">{entry.name}:</Text>
                        <Text fontSize="sm" fontWeight="medium">{formatSpeed(entry.value)}</Text>
                      </HStack>
                    ))}
                  </Box>
                );
              }}
            />
            {chart.series.map((item) => (
              <Area
                key={item.name}
                type="monotone"
                isAnimationActive={false}
                dataKey={chart.key(item.name)}
                fill={chart.color(item.color)}
                fillOpacity={0.2}
                stroke={chart.color(item.color)}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </Chart.Root>
      </Box>

      <AppConfigDrawer
        isOpen={isConfigDrawerOpen}
        onClose={() => setIsConfigDrawerOpen(false)}
      />
    </VStack>
  );
}
