import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';

interface LogMessage {
    timestamp: string;
    level: string;
    message: string;
}

interface UseLogWebSocketOptions {
    endpoint: string;
    enabled?: boolean;
    maxLogs?: number;
}

function parseLogLine(line: string): LogMessage {
    const now = new Date().toISOString();

    const mihomoMatch = line.match(/time="([^"]+)"\s+level=(\w+)\s+msg="(.+?)"/);
    if (mihomoMatch) {
        return {
            timestamp: mihomoMatch[1],
            level: mihomoMatch[2].toUpperCase(),
            message: mihomoMatch[3],
        };
    }

    const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:+\-]+)\s+(\w+)\s+(.+)$/);
    if (isoMatch) {
        return {
            timestamp: isoMatch[1],
            level: isoMatch[2],
            message: isoMatch[3],
        };
    }

    const dateMatch = line.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/);
    if (dateMatch) {
        return {
            timestamp: dateMatch[1],
            level: 'INFO',
            message: dateMatch[2],
        };
    }

    return {
        timestamp: now,
        level: 'INFO',
        message: line,
    };
}

export function useLogs({
    endpoint,
    enabled = true,
    maxLogs = 1000,
}: UseLogWebSocketOptions) {

    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const wsRef = useRef<WebSocket | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const reconnectTimeoutRef = useRef<number | undefined>(undefined);

    const connect = useCallback(() => {
        if (!enabled) return;

        const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + endpoint;

        try {
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                setIsConnected(true);
                setError(null);
                console.log('WebSocket connected:', endpoint);
            };

            ws.onmessage = (event) => {
                const message = event.data;
                if (typeof message === 'string') {
                    if (message.startsWith('ERROR:')) {
                        setError(message);
                        return;
                    }

                    const parsedLog = parseLogLine(message);
                    setLogs((prevLogs) => {
                        const isDuplicate = prevLogs.slice(-20).some(log =>
                            log.timestamp === parsedLog.timestamp &&
                            log.message === parsedLog.message
                        );

                        if (isDuplicate) {
                            return prevLogs;
                        }

                        const newLogs = [...prevLogs, parsedLog];
                        if (newLogs.length > maxLogs) {
                            return newLogs.slice(newLogs.length - maxLogs);
                        }
                        return newLogs;
                    });
                }
            };

            ws.onclose = () => {
                setIsConnected(false);
                wsRef.current = null;
                if (enabled) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, 3000);
                }
            };

            ws.onerror = () => {
                setError('WebSocket connection error');
                ws.close();
            };

            wsRef.current = ws;
        } catch (err: any) {
            setError(err.message || 'Failed to connect WebSocket');
        }
    }, [endpoint, enabled, maxLogs]);

    useEffect(() => {
        setLogs([]);

        if (enabled) {
            connect();
        }

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [endpoint, enabled, connect]);

    const scrollToBottom = useCallback(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, []);

    useEffect(() => {
        if (autoScroll) {
            scrollToBottom();
        }
    }, [logs, autoScroll, scrollToBottom]);

    const clearLogs = useCallback(async () => {
        try {
            const apiEndpoint = endpoint.includes('mihomo')
                ? '/api/v1/mihomo/logs'
                : '/api/v1/app/logs';

            await fetch(`${API_BASE_URL}${apiEndpoint}`, { method: 'DELETE' });
            setLogs([]);
        } catch (err) {
            console.error('Failed to clear logs:', err);
        }
    }, [endpoint]);


    const toggleAutoScroll = useCallback(() => {
        setAutoScroll((prev) => !prev);
    }, []);

    const refresh = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
        }
    }, []);

    return {
        logs,
        isLoading: !isConnected && enabled,
        error,
        autoScroll,
        logsEndRef,
        containerRef,
        clearLogs,
        toggleAutoScroll,
        refresh,
        scrollToBottom,
    };
}
