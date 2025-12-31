import { useState } from 'react';
import { VStack, Heading, Tabs, Box, Text, HStack, Button, Badge, Dialog } from '@chakra-ui/react';
import { Trash2, RefreshCw, ArrowDown, Play, Pause } from 'lucide-react';
import { useLogs } from '../hooks/useLogs';
import { API_ENDPOINTS } from '../config/api';

export function Logs() {
  const [mihomoEnabled, setMihomoEnabled] = useState(true);
  const [appEnabled, setAppEnabled] = useState(true);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const mihomoLogs = useLogs({
    endpoint: API_ENDPOINTS.logs.mihomo,
    enabled: mihomoEnabled,
    maxLogs: 500,
  });

  const appLogs = useLogs({
    endpoint: API_ENDPOINTS.logs.app,
    enabled: appEnabled,
    maxLogs: 500,
  });

  const renderLogViewer = (
    title: string,
    logsData: ReturnType<typeof useLogs>,

    enabled: boolean,
    onEnabledChange: (val: boolean) => void
  ) => (
    <Box borderWidth="1px" borderColor="border.DEFAULT" borderRadius="lg" bg="bg.surface">
      <VStack align="stretch" gap={0}>
        <HStack
          justify="space-between"
          p={4}
          borderBottomWidth="1px"
          borderColor="border.DEFAULT"
          flexWrap="wrap"
          gap={2}
        >
          <HStack gap={2} flexShrink={1} minW="120px">
            <Text fontSize={{ base: "md", md: "xl" }} fontWeight="bold" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{title}</Text>
            <Badge colorPalette={logsData.isLoading ? 'blue' : 'gray'} size="sm">
              {logsData.logs.length} logs
            </Badge>
          </HStack>

          <HStack gap={1} flexShrink={0}>
            <Button
              size={{ base: "xs", md: "sm" }}
              variant="outline"
              onClick={() => onEnabledChange(!enabled)}
              colorPalette={enabled ? "orange" : "green"}
              p={{ base: 1, md: 2 }}
              title={enabled ? "Pause logs" : "Resume logs"}
            >
              {enabled ? <Pause size={14} /> : <Play size={14} />}
              <Text ml={1} display={{ base: "none", md: "block" }}>{enabled ? "Pause" : "Resume"}</Text>
            </Button>

            <Button
              size={{ base: "xs", md: "sm" }}
              variant="outline"
              onClick={logsData.refresh}
              disabled={logsData.isLoading}
              p={{ base: 1, md: 2 }}
              title="Reconnect"
            >
              <RefreshCw size={14} />
            </Button>

            <Button
              size={{ base: "xs", md: "sm" }}
              variant="outline"
              colorPalette="red"
              onClick={logsData.clearLogs}
              disabled={logsData.logs.length === 0}
              p={{ base: 1, md: 2 }}
              title="Clear logs"
            >
              <Trash2 size={14} />
            </Button>
          </HStack>
        </HStack>

        <Box
          ref={logsData.containerRef}
          p={4}
          maxH="600px"
          overflowY="auto"
          fontFamily="monospace"
          fontSize="sm"
          bg="bg.DEFAULT"
          position="relative"
          style={{ scrollBehavior: 'smooth' }}
        >
          {logsData.error && (
            <Box p={3} mb={4} borderRadius="md" bg="red.500/10" borderWidth="1px" borderColor="red.500/20" maxW="100%" overflow="hidden">
              <Text color="red.500" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">{logsData.error}</Text>
            </Box>
          )}

          {logsData.logs.length === 0 && !logsData.error ? (
            <Text color="gray.500" textAlign="center" py={8}>
              {logsData.isLoading ? 'Connecting...' : enabled ? 'Waiting for logs...' : 'Logs paused'}
            </Text>
          ) : (
            <>
              <VStack align="stretch" gap={1}>
                {logsData.logs.map((log, index) => (
                  <Text
                    key={index}
                    p={2}
                    fontFamily="monospace"
                    fontSize={{ base: "xs", md: "sm" }}
                    borderRadius="sm"
                    _hover={{ bg: 'bg.surface' }}
                    whiteSpace={{ base: "normal", md: "nowrap" }}
                    overflow="hidden"
                    textOverflow="ellipsis"
                    maxW="100%"
                    wordBreak={{ base: "break-all", md: "normal" }}
                    cursor="pointer"
                    onClick={() => {
                      setSelectedLog(log.message);
                      setIsModalOpen(true);
                    }}
                  >
                    {log.message}
                  </Text>
                ))}
                <div ref={logsData.logsEndRef} />
              </VStack>

              <Box position="fixed" bottom={4} right={4} zIndex={10}>
                <Button
                  aria-label="Auto-scroll"
                  size="sm"
                  borderRadius="full"
                  boxShadow="md"
                  onClick={() => {
                    logsData.toggleAutoScroll();
                    if (!logsData.autoScroll) {
                      logsData.scrollToBottom();
                    }
                  }}
                  colorPalette={logsData.autoScroll ? "green" : "gray"}
                >
                  <ArrowDown size={16} />
                </Button>
              </Box>
            </>
          )}
        </Box>
      </VStack>
    </Box>
  );

  return (
    <VStack align="stretch" gap={6}>
      <Dialog.Root open={isModalOpen} onOpenChange={(details) => setIsModalOpen(details.open)}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxWidth="800px" width="90vw">
            <Dialog.Header>
              <Dialog.Title>Log Detail</Dialog.Title>
              <Dialog.CloseTrigger />
            </Dialog.Header>
            <Dialog.Body>
              <Box
                p={4}
                borderRadius="md"
                bg="bg.DEFAULT"
                fontFamily="monospace"
                fontSize="sm"
                whiteSpace="pre-wrap"
                wordBreak="break-word"
                overflowX="auto"
              >
                {selectedLog}
              </Box>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      <Heading size="2xl">Logs</Heading>

      <Tabs.Root defaultValue="mihomo" variant="enclosed">
        <Tabs.List>
          <Tabs.Trigger value="mihomo">Mihomo Core Logs</Tabs.Trigger>
          <Tabs.Trigger value="app">Application Logs</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="mihomo" pt={4}>
          {renderLogViewer('Mihomo Core Logs', mihomoLogs, mihomoEnabled, setMihomoEnabled)}
        </Tabs.Content>

        <Tabs.Content value="app" pt={4}>
          {renderLogViewer('Application Logs', appLogs, appEnabled, setAppEnabled)}
        </Tabs.Content>
      </Tabs.Root>
    </VStack>
  );
}
