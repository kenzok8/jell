import { Box, Heading, Tabs, Text } from '@chakra-ui/react';
import { Settings, Server, List, Archive } from 'lucide-react';
import { Manager as FileManager } from '../components/Manager';
import { BackupRestore } from '../components/BackupRestore';


export function Manager() {
  return (
    <Box>
      <Heading size="2xl" mb={6}>Manager</Heading>

      <Tabs.Root defaultValue="main-config" variant="plain">
        <Tabs.List
          bg="bg.muted"
          rounded="lg"
          p={{ base: 2, md: 1 }}
          display="flex"
          flexDirection={{ base: 'column', md: 'row' }}
          gap={{ base: 1, md: 0 }}
          minW={{ base: '100%', md: 'auto' }}
          width="100%"
        >
          <Tabs.Trigger
            value="main-config"
            justifyContent="flex-start"
            textAlign="left"
            width="100%"
            py={{ base: 3, md: 2 }}
            px={{ base: 3, md: 3 }}
          >
            <Settings size={16} />
            <Text ml={2} fontSize={{ base: 'sm', md: 'sm' }}>Main Config</Text>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="proxy-providers"
            justifyContent="flex-start"
            textAlign="left"
            width="100%"
            py={{ base: 3, md: 2 }}
            px={{ base: 3, md: 3 }}
          >
            <Server size={16} />
            <Text ml={2} fontSize={{ base: 'sm', md: 'sm' }}>Proxy Providers</Text>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="rule-providers"
            justifyContent="flex-start"
            textAlign="left"
            width="100%"
            py={{ base: 3, md: 2 }}
            px={{ base: 3, md: 3 }}
          >
            <List size={16} />
            <Text ml={2} fontSize={{ base: 'sm', md: 'sm' }}>Rule Providers</Text>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="backup"
            justifyContent="flex-start"
            textAlign="left"
            width="100%"
            py={{ base: 3, md: 2 }}
            px={{ base: 3, md: 3 }}
          >
            <Archive size={16} />
            <Text ml={2} fontSize={{ base: 'sm', md: 'sm' }}>Backup</Text>
          </Tabs.Trigger>
          <Tabs.Indicator rounded="md" />
        </Tabs.List>

        <Box mt={6}>
          <Tabs.Content value="main-config">
            <Box
              bg="bg.surface"
              p={6}
              borderRadius="lg"
              borderWidth="1px"
              borderColor="border.DEFAULT"
            >
              <Heading size="lg" mb={4}>Main Config</Heading>
              <FileManager type="configs" />
            </Box>
          </Tabs.Content>

          <Tabs.Content value="proxy-providers">
            <Box
              bg="bg.surface"
              p={6}
              borderRadius="lg"
              borderWidth="1px"
              borderColor="border.DEFAULT"
            >
              <Heading size="lg" mb={4}>Proxy Providers</Heading>
              <FileManager type="proxy_providers" />
            </Box>
          </Tabs.Content>

          <Tabs.Content value="rule-providers">
            <Box
              bg="bg.surface"
              p={6}
              borderRadius="lg"
              borderWidth="1px"
              borderColor="border.DEFAULT"
            >
              <Heading size="lg" mb={4}>Rule Providers</Heading>
              <FileManager type="rule_providers" />
            </Box>
          </Tabs.Content>

          <Tabs.Content value="backup">
            <Box
              bg="bg.surface"
              p={6}
              borderRadius="lg"
              borderWidth="1px"
              borderColor="border.DEFAULT"
            >
              <Heading size="lg" mb={4}>Backup & Restore</Heading>
              <BackupRestore />
            </Box>

          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Box>
  );
}
