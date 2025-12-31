import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { mihomoApi } from '../services/api';

interface TrafficData {
    up: number;
    down: number;
}

interface MemoryData {
    inuse: number;
    oslimit: number;
}

interface MihomoStats {

    memory: number;
    connections: number;
    traffic: {
        up: number;
        down: number;
    };
    speed: {
        upload: number;
        download: number;
    };
    ipInfo: {
        ipv4: string;
        ipv6: string;
    };
}

interface HistoryData {
    time: number;
    memory: number;
    connections: number;
    uploadSpeed: number;
    downloadSpeed: number;
}

const MAX_HISTORY = 60;

export function useMihomoStats() {

    const [stats, setStats] = useState<MihomoStats>({
        memory: 0,
        connections: 0,
        traffic: { up: 0, down: 0 },
        speed: { upload: 0, download: 0 },
        ipInfo: { ipv4: '', ipv6: '' },
    });
    const [history, setHistory] = useState<HistoryData[]>([]);
    const [error, setError] = useState<string | null>(null);

    const trafficWsRef = useRef<WebSocket | null>(null);
    const memoryWsRef = useRef<WebSocket | null>(null);
    const connectionsWsRef = useRef<WebSocket | null>(null);

    const prevTrafficRef = useRef<TrafficData>({ up: 0, down: 0 });

    const connectWebSocket = useCallback((endpoint: string, onMessage: (data: any) => void) => {
        const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + endpoint;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setError(null);
        };

        ws.onmessage = (event) => {
            const message = event.data;
            if (typeof message === 'string') {
                if (message.startsWith('ERROR:')) {
                    setError(message);
                    return;
                }

                const trimmed = message.trim();
                if (!trimmed) return;

                try {
                    const data = JSON.parse(trimmed);
                    onMessage(data);
                } catch (err) {
                    console.warn('Skipping invalid JSON:', trimmed.substring(0, 100));
                }
            }
        };


        ws.onerror = () => {
            setError('WebSocket connection error');
        };

        ws.onclose = () => {
            setTimeout(() => {
                const newWs = connectWebSocket(endpoint, onMessage);
                if (endpoint.includes('traffic')) trafficWsRef.current = newWs;
                else if (endpoint.includes('memory')) memoryWsRef.current = newWs;
                else if (endpoint.includes('connections')) connectionsWsRef.current = newWs;
            }, 3000);
        };

        return ws;
    }, []);

    useEffect(() => {
        mihomoApi.getIPInfo()
            .then(ipInfo => {
                setStats(prev => ({ ...prev, ipInfo }));
            })
            .catch(() => { });

        trafficWsRef.current = connectWebSocket('/api/v1/mihomo/traffic', (data: TrafficData) => {
            setStats(prev => ({
                ...prev,
                speed: {
                    upload: data.up,
                    download: data.down,
                },
            }));

            setHistory(prev => {
                const newHistory = [...prev, {
                    time: Date.now(),
                    memory: prev[prev.length - 1]?.memory || 0,
                    connections: prev[prev.length - 1]?.connections || 0,
                    uploadSpeed: data.up,
                    downloadSpeed: data.down,
                }];
                return newHistory.slice(-MAX_HISTORY);
            });

            prevTrafficRef.current = data;
        });

        memoryWsRef.current = connectWebSocket('/api/v1/mihomo/memory', (data: MemoryData) => {
            setStats(prev => ({
                ...prev,
                memory: data.inuse,
            }));
        });

        connectionsWsRef.current = connectWebSocket('/api/v1/mihomo/connections', (data: any) => {
            try {
                const connections = Array.isArray(data.connections) ? data.connections : [];
                const uploadTotal = typeof data.uploadTotal === 'number' ? data.uploadTotal : 0;
                const downloadTotal = typeof data.downloadTotal === 'number' ? data.downloadTotal : 0;

                setStats(prev => ({
                    ...prev,
                    connections: connections.length,
                    traffic: {
                        up: uploadTotal,
                        down: downloadTotal,
                    },
                }));
            } catch (err) {
                console.error('Failed to process connections data:', err);
            }
        });


        return () => {
            if (trafficWsRef.current) trafficWsRef.current.close();
            if (memoryWsRef.current) memoryWsRef.current.close();
            if (connectionsWsRef.current) connectionsWsRef.current.close();
        };
    }, [connectWebSocket]);

    return { stats, history, error };
}
