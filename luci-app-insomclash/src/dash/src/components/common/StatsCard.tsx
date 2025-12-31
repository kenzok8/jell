import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color: 'purple' | 'green' | 'cyan' | 'pink' | 'orange';
}

const colorMap = {
  purple: { bg: '#0099ff', text: '#ffffff' },
  green: { bg: '#00ff88', text: '#0a1628' },
  cyan: { bg: '#00d4ff', text: '#0a1628' },
  pink: { bg: '#0088cc', text: '#ffffff' },
  orange: { bg: '#00aaff', text: '#ffffff' },
};

export function StatsCard({ title, value, icon: Icon, trend, color }: StatsCardProps) {
  const colors = colorMap[color];
  
  return (
    <Box
      bg="bg.surface"
      p={{ base: 4, md: 6 }}
      borderRadius="lg"
      borderWidth="1px"
      borderColor="border.DEFAULT"
      transition="all 0.2s"
      _hover={{ shadow: 'md' }}
    >
      <HStack justify="space-between" align="start">
        <VStack align="start" gap={1} flex={1}>
          <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.500" fontWeight="medium">
            {title}
          </Text>
          <HStack align="baseline" gap={2}>
            <Text fontSize={{ base: 'xl', md: '3xl' }} fontWeight="bold">
              {value}
            </Text>
            {trend && (
              <Text fontSize="sm" color="green.500">
                {trend}
              </Text>
            )}
          </HStack>
        </VStack>
        <Box
          bg={colors.bg}
          p={{ base: 2, md: 3 }}
          borderRadius="lg"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Icon size={20} color={colors.text} />
        </Box>
      </HStack>
    </Box>
  );
}
