import { Box, Heading, Text, Tabs } from '@chakra-ui/react';
import { RefreshCw, Globe } from 'lucide-react';
import { SubscriptionConverter } from '../components/tools/SubscriptionConverter';
import { DomainToIP } from '../components/tools/DomainToIP';

export function Tools() {
  return (
    <Box>
      <Heading size="2xl" mb={6}>Tools</Heading>

      <Tabs.Root defaultValue="converter" variant="plain">
        <Tabs.List
          bg="bg.muted"
          rounded="lg"
          p={{ base: 2, md: 1 }}
          display="flex"
          flexDirection={{ base: 'column', md: 'row' }}
          gap={{ base: 1, md: 0 }}
          width="100%"
        >
          <Tabs.Trigger
            value="converter"
            justifyContent="flex-start"
            textAlign="left"
            width="100%"
            py={{ base: 3, md: 2 }}
            px={{ base: 3, md: 3 }}
          >
            <RefreshCw size={16} />
            <Text ml={2} fontSize={{ base: 'sm', md: 'sm' }}>Converter</Text>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="domain-to-ip"
            justifyContent="flex-start"
            textAlign="left"
            width="100%"
            py={{ base: 3, md: 2 }}
            px={{ base: 3, md: 3 }}
          >
            <Globe size={16} />
            <Text ml={2} fontSize={{ base: 'sm', md: 'sm' }}>Domain to IP</Text>
          </Tabs.Trigger>
          <Tabs.Indicator rounded="md" />
        </Tabs.List>

        <Box mt={6}>
          <Tabs.Content value="converter">
            <SubscriptionConverter />
          </Tabs.Content>

          <Tabs.Content value="domain-to-ip">
            <DomainToIP />
          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Box>
  );
}
