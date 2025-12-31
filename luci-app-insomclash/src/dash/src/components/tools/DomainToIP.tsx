import { useState } from 'react';
import {
    Box,
    Button,
    Input,
    VStack,
    HStack,
    Heading,
    Text,
    Card,
    Spinner,
    IconButton
} from '@chakra-ui/react';
import { Search, Copy, Check } from 'lucide-react';
import { showSuccess, showError } from '../../utils/notification';
import { API_BASE_URL } from '../../config/api';

interface LookupResponse {
    success: boolean;
    domain: string;
    ipv4: string[];
    ipv6: string[];
    error?: string;
}

export function DomainToIP() {
    const [domain, setDomain] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<LookupResponse | null>(null);
    const [copiedIp, setCopiedIp] = useState<string | null>(null);

    const handleLookup = async () => {
        if (!domain.trim()) {
            showError('Please enter a domain name');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/dns/lookup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ domain: domain.trim() }),
            });

            const data: LookupResponse = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to lookup domain');
            }

            setResult(data);
            if (data.ipv4.length === 0 && data.ipv6.length === 0) {
                showError('No IP addresses found for this domain');
            } else {
                showSuccess('Domain lookup successful');
            }
        } catch (error) {
            console.error('Lookup error:', error);
            showError(error instanceof Error ? error.message : 'Lookup failed');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleLookup();
        }
    };

    const handleCopy = async (text: string) => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }

            setCopiedIp(text);
            setTimeout(() => setCopiedIp(null), 2000);
            showSuccess('Copied to clipboard');
        } catch (error) {
            showError('Failed to copy');
        }
    };

    return (
        <Box
            bg="bg.surface"
            p={6}
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border.DEFAULT"
        >
            <Heading size="lg" mb={4}>Domain to IP Lookup</Heading>

            <VStack gap={6} align="stretch">
                <Box>
                    <Text fontWeight="medium" mb={2}>Domain Name</Text>
                    <HStack gap={2}>
                        <Input
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="e.g. google.com"
                            fontFamily="mono"
                        />
                        <Button
                            onClick={handleLookup}
                            disabled={loading || !domain.trim()}
                            colorPalette="blue"
                            minW="120px"
                        >
                            {loading ? <Spinner size="sm" mr={2} /> : <Search size={16} style={{ marginRight: '8px' }} />}
                            Lookup
                        </Button>
                    </HStack>
                </Box>

                {result && (
                    <VStack gap={4} align="stretch">
                        {(result.ipv4.length > 0 || result.ipv6.length > 0) ? (
                            <>
                                <Card.Root size="sm" variant="subtle">
                                    <Card.Body>
                                        <Heading size="sm" mb={3} color="fg.subtle">IPv4 Addresses</Heading>
                                        {result.ipv4.length > 0 ? (
                                            <VStack align="stretch" gap={2}>
                                                {result.ipv4.map((ip, idx) => (
                                                    <HStack key={`v4-${idx}`} justify="space-between" bg="bg.muted" p={2} borderRadius="md">
                                                        <Text fontFamily="mono" fontSize="sm">{ip}</Text>
                                                        <IconButton
                                                            aria-label="Copy IP"
                                                            variant="ghost"
                                                            size="xs"
                                                            onClick={() => handleCopy(ip)}
                                                        >
                                                            {copiedIp === ip ? <Check size={14} color="green" /> : <Copy size={14} />}
                                                        </IconButton>
                                                    </HStack>
                                                ))}
                                            </VStack>
                                        ) : (
                                            <Text fontSize="sm" color="fg.muted">No IPv4 addresses found</Text>
                                        )}
                                    </Card.Body>
                                </Card.Root>

                                <Card.Root size="sm" variant="subtle">
                                    <Card.Body>
                                        <Heading size="sm" mb={3} color="fg.subtle">IPv6 Addresses</Heading>
                                        {result.ipv6.length > 0 ? (
                                            <VStack align="stretch" gap={2}>
                                                {result.ipv6.map((ip, idx) => (
                                                    <HStack key={`v6-${idx}`} justify="space-between" bg="bg.muted" p={2} borderRadius="md">
                                                        <Text fontFamily="mono" fontSize="sm">{ip}</Text>
                                                        <IconButton
                                                            aria-label="Copy IP"
                                                            variant="ghost"
                                                            size="xs"
                                                            onClick={() => handleCopy(ip)}
                                                        >
                                                            {copiedIp === ip ? <Check size={14} color="green" /> : <Copy size={14} />}
                                                        </IconButton>
                                                    </HStack>
                                                ))}
                                            </VStack>
                                        ) : (
                                            <Text fontSize="sm" color="fg.muted">No IPv6 addresses found</Text>
                                        )}
                                    </Card.Body>
                                </Card.Root>
                            </>
                        ) : (
                            <Box p={4} bg="bg.subtle" borderRadius="md" textAlign="center">
                                <Text color="fg.muted">No records found for {result.domain}</Text>
                            </Box>
                        )}
                    </VStack>
                )}
            </VStack>
        </Box>
    );
}
