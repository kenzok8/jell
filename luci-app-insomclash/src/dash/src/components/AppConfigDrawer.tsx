import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Input,
  VStack,
  HStack,
  Heading,
  Text,
  Drawer,
  Portal,
  NativeSelectRoot,
  NativeSelectField,
} from '@chakra-ui/react';
import { showSuccess, showError } from '../utils/notification';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import { mihomoApi } from '../services/api';

interface MihomoConfig {
  CorePath: string;
  ConfigPath: string;
  WorkingDir: string;
  AutoRestart: boolean;
  LogFile: string;
  APIURL: string;
  APISecret: string;
  Routing: {
    TCP: string;
    UDP: string;
  };
}

interface LoggingConfig {
  level: string;
}

interface AppConfig {
  mihomo: MihomoConfig;
  logging: LoggingConfig;
}

interface AppConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppConfigDrawer({ isOpen, onClose }: AppConfigDrawerProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coreVersion, setCoreVersion] = useState<string>('Loading...');
  const [availableConfigs, setAvailableConfigs] = useState<string[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      fetchCoreVersion();
      fetchAvailableConfigs();
    }
  }, [isOpen]);

  const fetchAvailableConfigs = async () => {
    setLoadingConfigs(true);
    try {
      const configs = await mihomoApi.getConfigs();
      console.log('Available configs:', configs);
      setAvailableConfigs(configs);
    } catch (error) {
      console.error('Failed to fetch available configs:', error);
    } finally {
      setLoadingConfigs(false);
    }
  };

  const fetchCoreVersion = async () => {
    try {
      const version = await mihomoApi.getCoreVersion();
      setCoreVersion(version);
    } catch (error) {
      console.error('Failed to fetch core version:', error);
      setCoreVersion('Unknown');
    }
  };

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.app.config}`);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to fetch config:', error);
      showError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.app.config}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update configuration');
      }

      showSuccess('Configuration updated successfully');
      onClose();
    } catch (error) {
      console.error('Failed to save config:', error);
      showError(error instanceof Error ? error.message : 'Failed to update configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof MihomoConfig, value: any) => {
    if (!config) return;

    setConfig({
      ...config,
      mihomo: {
        ...config.mihomo,
        [field]: value
      }
    });
  };

  const handleNestedChange = (field: string, value: any) => {
    if (!config) return;

    setConfig({
      ...config,
      mihomo: {
        ...config.mihomo,
        Routing: {
          ...config.mihomo.Routing,
          [field]: value
        }
      }
    });
  };

  const handleLoggingChange = (field: keyof LoggingConfig, value: any) => {
    if (!config) return;

    setConfig({
      ...config,
      logging: {
        ...config.logging,
        [field]: value
      }
    });
  };

  if (!config && loading) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Header>
                <Drawer.Title>App Configuration</Drawer.Title>
                <Drawer.CloseTrigger />
              </Drawer.Header>
              <Box p={4} borderBottomWidth="1px" borderColor="border.DEFAULT">
                <HStack justify="space-between">
                  <Text fontSize="sm" color="fg.muted">Core Version:</Text>
                  <Text fontSize="sm" fontWeight="medium">{coreVersion}</Text>
                </HStack>
              </Box>
              <Drawer.Body>
                <Text>Loading configuration...</Text>
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    );
  }

  if (!config) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Header>
                <Drawer.Title>App Configuration</Drawer.Title>
                <Drawer.CloseTrigger />
              </Drawer.Header>
              <Box p={4} borderBottomWidth="1px" borderColor="border.DEFAULT">
                <HStack justify="space-between">
                  <Text fontSize="sm" color="fg.muted">Core Version:</Text>
                  <Text fontSize="sm" fontWeight="medium">{coreVersion}</Text>
                </HStack>
              </Box>
              <Drawer.Body>
                <Text color="red.500">Failed to load configuration</Text>
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    );
  }

  return (
    <Drawer.Root size="md" open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>App Configuration</Drawer.Title>
              <Drawer.CloseTrigger />
            </Drawer.Header>
            <Box p={4} borderBottomWidth="1px" borderColor="border.DEFAULT">
              <HStack justify="space-between">
                <Text fontSize="sm" color="fg.muted">Core Version:</Text>
                <Text fontSize="sm" fontWeight="medium">{coreVersion}</Text>
              </HStack>
            </Box>
            <Drawer.Body>
              <Box as="form" onSubmit={handleSubmit}>
                <VStack gap={6} align="stretch">
                  <Box>
                    <Heading size="md" mb={4}>Mihomo Settings</Heading>
                    <VStack gap={4} align="stretch">
                      <Box>
                        <Text fontWeight="medium">Core Path</Text>
                        <Input
                          value={config.mihomo.CorePath}
                          onChange={(e) => handleChange('CorePath', e.target.value)}
                        />
                      </Box>
                      <Box>
                        <Text fontWeight="medium">Config Path</Text>
                        <HStack>
                          <Input
                            value={config.mihomo.ConfigPath}
                            onChange={(e) => handleChange('ConfigPath', e.target.value)}
                          />
                          <NativeSelectRoot width="200px">
                            <NativeSelectField
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleChange('ConfigPath', `${config.mihomo.WorkingDir}/configs/${e.target.value}`);
                                }
                              }}
                            >



                              <option value="" disabled>
                                {loadingConfigs ? 'Loading...' : availableConfigs.length === 0 ? 'No configs' : 'Select config'}
                              </option>
                              {availableConfigs && availableConfigs.length > 0 && availableConfigs.map(filename => (
                                <option key={filename} value={filename}>{filename}</option>
                              ))}
                            </NativeSelectField>
                          </NativeSelectRoot>
                        </HStack>
                      </Box>
                      <Box>
                        <Text fontWeight="medium">Working Directory</Text>
                        <Input
                          value={config.mihomo.WorkingDir}
                          onChange={(e) => handleChange('WorkingDir', e.target.value)}
                        />
                      </Box>
                      <Box>
                        <Text fontWeight="medium">Log File</Text>
                        <Input
                          value={config.mihomo.LogFile}
                          onChange={(e) => handleChange('LogFile', e.target.value)}
                        />
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Text fontWeight="medium" mb={0} mr={2}>Auto Restart</Text>
                        <input
                          type="checkbox"
                          checked={config.mihomo.AutoRestart}
                          onChange={(e) => handleChange('AutoRestart', e.target.checked)}
                          style={{ width: '16px', height: '16px' }}
                        />
                      </Box>

                      <Box mt={2}>
                        <Text fontWeight="medium" mb={2}>Routing</Text>
                        <HStack gap={4}>
                          <Box>
                            <Text fontWeight="medium" mb={2}>TCP</Text>
                            <NativeSelectRoot>
                              <NativeSelectField
                                value={config.mihomo.Routing.TCP}
                                onChange={(e) => handleNestedChange('TCP', e.target.value)}
                              >
                                <option value="tproxy">TProxy</option>
                                <option value="tun">TUN</option>
                                <option value="redirect">Redirect</option>
                                <option value="disable">Disable</option>
                              </NativeSelectField>
                            </NativeSelectRoot>
                          </Box>
                          <Box>
                            <Text fontWeight="medium" mb={2}>UDP</Text>
                            <NativeSelectRoot>
                              <NativeSelectField
                                value={config.mihomo.Routing.UDP}
                                onChange={(e) => handleNestedChange('UDP', e.target.value)}
                              >
                                <option value="tproxy">TProxy</option>
                                <option value="tun">TUN</option>
                                <option value="disable">Disable</option>
                              </NativeSelectField>
                            </NativeSelectRoot>
                          </Box>
                        </HStack>
                      </Box>
                    </VStack>
                  </Box>

                  <Box>
                    <Heading size="md" mb={4}>Application Logging</Heading>
                    <VStack gap={4} align="stretch">
                      <Box>
                        <Text fontWeight="medium" mb={2}>Log Level</Text>
                        <NativeSelectRoot>
                          <NativeSelectField
                            value={config.logging.level}
                            onChange={(e) => handleLoggingChange('level', e.target.value)}
                          >
                            <option value="debug">Debug</option>
                            <option value="info">Info</option>
                            <option value="warn">Warning</option>
                            <option value="error">Error</option>
                          </NativeSelectField>
                        </NativeSelectRoot>
                        <Text fontSize="sm" color="fg.muted" mt={2}>
                          Note: Restart application to apply logging level changes
                        </Text>
                      </Box>
                    </VStack>
                  </Box>
                </VStack>
              </Box>
            </Drawer.Body>
            <Drawer.Footer>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button colorScheme="blue" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
