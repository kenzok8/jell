import { Box, Container, HStack, Text, Link } from '@chakra-ui/react';
import { Github } from 'lucide-react';

export function Footer() {
    return (
        <Box as="footer" py={6} borderTopWidth="1px" mt={16}>
            <Container maxW="7xl">
                <HStack justify="space-between" flexWrap="wrap" gap={4}>
                    <Text fontSize="sm" color="fg.muted">
                        © {new Date().getFullYear()} FusionTunX. Advanced Proxy Management
                    </Text>
                    <HStack gap={4}>
                        <Text fontSize="sm" color="fg.muted">
                            Created by
                        </Text>
                        <Link
                            href="https://github.com/bobbyunknown"
                            target="_blank"
                            rel="noopener noreferrer"
                            display="flex"
                            alignItems="center"
                            gap={2}
                            fontSize="sm"
                            fontWeight="medium"
                            color="fg.DEFAULT"
                            _hover={{ color: 'colorPalette.600' }}
                        >
                            <Github size={16} />
                            Bobby Unknown
                        </Link>
                    </HStack>
                </HStack>
            </Container>
        </Box>
    );
}
