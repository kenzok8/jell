import { useState } from 'react';
import {
    Box,
    Button,
    Textarea,
    VStack,
    HStack,
    Heading,
    Text,
    Badge,
    Code,
} from '@chakra-ui/react';
import { Download, Copy, Check } from 'lucide-react';
import { showSuccess, showError } from '../../utils/notification';
import { API_BASE_URL } from '../../config/api';


interface Proxy {
    name: string;
    type: string;
    server: string;
    port: number;
    [key: string]: any;
}

interface ParseResponse {
    success: boolean;
    proxies?: Proxy[];
    count: number;
    error?: string;
}

export function SubscriptionConverter() {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [proxies, setProxies] = useState<Proxy[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [copiedAll, setCopiedAll] = useState(false);

    const handleParse = async () => {
        if (!input.trim()) {
            showError('Please enter a subscription URL or proxy link');
            return;
        }

        setLoading(true);
        try {
            const trimmedInput = input.trim();

            const lines = trimmedInput.split('\n').map(l => l.trim()).filter(l => l);
            const hasMultipleProxyLinks = lines.length > 1 &&
                lines.every(line =>
                    line.startsWith('vmess://') ||
                    line.startsWith('vless://') ||
                    line.startsWith('trojan://') ||
                    line.startsWith('ss://')
                );

            let payload;

            if (hasMultipleProxyLinks) {
                const base64Content = btoa(lines.join('\n'));
                payload = { content: base64Content };
            } else if (trimmedInput.startsWith('http')) {
                payload = { url: trimmedInput };
            } else if (trimmedInput.includes('://')) {
                payload = { url: trimmedInput };
            } else {
                payload = { content: trimmedInput };
            }

            const response = await fetch(`${API_BASE_URL}/api/v1/converter/parse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data: ParseResponse = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to parse');
            }

            setProxies(data.proxies || []);
            showSuccess(`Successfully parsed ${data.count} proxies`);
        } catch (error) {
            console.error('Parse error:', error);
            showError(error instanceof Error ? error.message : 'Failed to parse proxies');
        } finally {
            setLoading(false);
        }
    };

    const proxyToYAML = (proxy: Proxy): string => {
        const lines: string[] = [];

        lines.push(`  - name: "${proxy.name}"`);

        lines.push(`    type: ${proxy.type}`);
        lines.push(`    server: ${proxy.server}`);
        lines.push(`    port: ${proxy.port}`);

        if (proxy.uuid) lines.push(`    uuid: ${proxy.uuid}`);
        if (proxy.password) lines.push(`    password: ${proxy.password}`);

        if (proxy.type === 'vmess') {
            lines.push(`    alterId: ${proxy.alterId !== undefined ? proxy.alterId : 0}`);
        }

        if (proxy.cipher) lines.push(`    cipher: ${proxy.cipher}`);

        // TLS
        if (proxy.tls) {
            lines.push(`    tls: true`);
        }

        lines.push(`    skip-cert-verify: true`);

        const sniValue = proxy.sni || proxy.SNI;
        if (sniValue) {
            if (proxy.type === 'trojan') {
                lines.push(`    sni: ${sniValue}`);
            } else if (proxy.type === 'vless' || proxy.type === 'vmess') {
                lines.push(`    servername: ${sniValue}`);
            }
        }

        if (proxy.udp) lines.push(`    udp: true`);
        lines.push(`    client-fingerprint: chrome`);
        if (proxy.alpn && proxy.alpn.length > 0) {
            lines.push(`    alpn:`);
            proxy.alpn.forEach((a: string) => lines.push(`      - ${a}`));
        }

        if (proxy.network) {
            const network = proxy.network.toLowerCase();

            if (network === 'httpupgrade') {
                lines.push(`    network: ws`);
                lines.push(`    ws-opts:`);

                const path = proxy['ws-path'] || proxy.WSPath || `/${proxy.type}-httpupgrade`;
                lines.push(`      path: ${path}`);

                if (proxy['ws-headers'] || proxy.WSHeaders || sniValue) {
                    const headers = proxy['ws-headers'] || proxy.WSHeaders || {};
                    const host = headers.Host || sniValue;
                    lines.push(`      headers:`);
                    lines.push(`        Host: ${host}`);
                }

                lines.push(`      v2ray-http-upgrade: true`);
                lines.push(`      v2ray-http-upgrade-fast-open: false`);
            }
            else if (network === 'ws') {
                lines.push(`    network: ws`);
                lines.push(`    ws-opts:`);

                if (proxy['ws-path'] || proxy.WSPath) {
                    lines.push(`      path: ${proxy['ws-path'] || proxy.WSPath}`);
                }

                if (proxy['ws-headers'] || proxy.WSHeaders) {
                    const headers = proxy['ws-headers'] || proxy.WSHeaders;
                    lines.push(`      headers:`);
                    Object.entries(headers).forEach(([key, value]) => {
                        lines.push(`        ${key}: ${value}`);
                    });
                }
            }
            else if (network === 'grpc') {
                lines.push(`    network: grpc`);
                lines.push(`    grpc-opts:`);

                if (proxy['grpc-service-name'] || proxy.GRPCServiceName) {
                    lines.push(`      grpc-service-name: ${proxy['grpc-service-name'] || proxy.GRPCServiceName}`);
                }
            }
            else if (network === 'splithttp' || network === 'xhttp') {
                lines.push(`    network: ${network}`);

                if (network === 'splithttp') {
                    const path = proxy['splithttp-path'] || proxy.SplitHTTPPath || `/${proxy.type}-splithttp`;
                    lines.push(`    splithttp-opts:`);
                    lines.push(`      path: ${path}`);
                } else if (network === 'xhttp') {
                    const path = proxy['xhttp-path'] || proxy.XHTTPPath || `/${proxy.type}-xhttp`;
                    lines.push(`    xhttp-opts:`);
                    lines.push(`      path: ${path}`);
                }
            }
            else if (network === 'tcp' && (proxy.type === 'vless' || proxy.type === 'vmess') && proxy.tls) {
                lines.push(`    network: tcp`);
            }
        }

        if (proxy.plugin) {
            lines.push(`    plugin: ${proxy.plugin}`);
            if (proxy['plugin-opts'] || proxy.PluginOpts) {
                const opts = proxy['plugin-opts'] || proxy.PluginOpts;
                lines.push(`    plugin-opts:`);
                Object.entries(opts).forEach(([key, value]) => {
                    lines.push(`      ${key}: ${value}`);
                });
            }
        }

        return lines.join('\n');
    };

    const handleCopy = async (proxy: Proxy, index: number) => {
        try {
            const yaml = proxyToYAML(proxy);

            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(yaml);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = yaml;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }

            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
            showSuccess('Copied to clipboard');
        } catch (error) {
            console.error('Copy error:', error);
            showError('Failed to copy');
        }
    };

    const handleDownload = () => {
        const yaml = `proxies:\n${proxies.map(p => proxyToYAML(p)).join('\n')}`;
        const blob = new Blob([yaml], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'proxies.yaml';
        a.click();
        URL.revokeObjectURL(url);
        showSuccess('Downloaded proxies.yaml');
    };

    const handleCopyAll = async () => {
        try {
            const yaml = `proxies:\n${proxies.map(p => proxyToYAML(p)).join('\n')}`;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(yaml);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = yaml;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }

            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 2000);
            showSuccess('Copied all proxies to clipboard');
        } catch (error) {
            console.error('Copy all error:', error);
            showError('Failed to copy');
        }
    };

    const getProxyTypeColor = (type: string) => {
        switch (type) {
            case 'vmess': return 'blue';
            case 'vless': return 'purple';
            case 'trojan': return 'red';
            case 'ss': return 'green';
            default: return 'gray';
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
            <Heading size="lg" mb={4}>Subscription Converter</Heading>

            <VStack gap={6} align="stretch">
                <Box>
                    <Text fontWeight="medium" mb={2}>Input</Text>
                    <Text fontSize="sm" color="fg.muted" mb={3}>
                        Enter a subscription URL, single proxy link (vmess/vless/trojan/ss), or base64 encoded content
                    </Text>
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="https://example.com/sub&#10;or&#10;vmess://...&#10;or&#10;base64 encoded content"
                        rows={6}
                        fontFamily="mono"
                        fontSize="sm"
                    />
                </Box>

                <HStack>
                    <Button
                        onClick={handleParse}
                        disabled={loading || !input.trim()}
                        colorPalette="blue"
                    >
                        {loading ? 'Parsing...' : 'Parse'}
                    </Button>
                    {proxies.length > 0 && (
                        <>
                            <Button
                                onClick={handleCopyAll}
                                variant="outline"
                            >
                                {copiedAll ? (
                                    <Check size={16} />
                                ) : (
                                    <Copy size={16} />
                                )}
                                Copy All
                            </Button>
                            <Button
                                onClick={handleDownload}
                                variant="outline"
                            >
                                <Download size={16} />
                                Download YAML
                            </Button>
                        </>
                    )}
                </HStack>

                {proxies.length > 0 && (
                    <Box>
                        <Text fontWeight="medium" mb={3}>
                            Parsed Proxies ({proxies.length})
                        </Text>
                        <VStack gap={3} align="stretch" maxH="500px" overflowY="auto">
                            {proxies.map((proxy, index) => (
                                <Box
                                    key={index}
                                    p={4}
                                    borderWidth="1px"
                                    borderRadius="md"
                                    borderColor="border.DEFAULT"
                                    bg="bg.subtle"
                                >
                                    <HStack justify="space-between" mb={2}>
                                        <HStack>
                                            <Badge colorPalette={getProxyTypeColor(proxy.type)}>
                                                {proxy.type.toUpperCase()}
                                            </Badge>
                                            <Text fontWeight="bold" fontSize="sm">{proxy.name}</Text>
                                        </HStack>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleCopy(proxy, index)}
                                        >
                                            {copiedIndex === index ? (
                                                <Check size={16} />
                                            ) : (
                                                <Copy size={16} />
                                            )}
                                        </Button>
                                    </HStack>
                                    <Text fontSize="sm" color="fg.muted">
                                        {proxy.server}:{proxy.port}
                                        {proxy.network && ` • ${proxy.network}`}
                                        {proxy.tls && ' • TLS'}
                                    </Text>
                                    <Code fontSize="xs" mt={2} display="block" p={2} borderRadius="sm" whiteSpace="pre-wrap">
                                        {proxyToYAML(proxy)}
                                    </Code>
                                </Box>
                            ))}
                        </VStack>
                    </Box>
                )}
            </VStack>
        </Box>
    );
}
