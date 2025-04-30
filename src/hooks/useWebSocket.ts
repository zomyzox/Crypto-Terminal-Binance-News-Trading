import { useEffect, useRef, useState, useCallback } from 'react';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const RETRY_DELAY = 3000; // 3 seconds between retries
const MAX_RETRIES = 5;

export function useWebSocket<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [retryCountdown, setRetryCountdown] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<number | null>(null);

  const clearRetryTimeout = () => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (retryCountdown > 0) {
      const timer = setTimeout(() => {
        setRetryCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [retryCountdown]);

  const connect = useCallback(() => {
    if (!url) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    clearRetryTimeout();
    
    console.log(`Attempting to connect to WebSocket: ${url}`);
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to create WebSocket: ${errorMessage}`);
      setStatus('disconnected');
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setError(null);
      retryCountRef.current = 0;
      console.log(`Successfully connected to WebSocket: ${url}`);
    };

    ws.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        setData(parsedData);
        console.log('Received WebSocket data:', parsedData);
      } catch (err) {
        console.error('Failed to parse WebSocket data:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to parse WebSocket data: ${errorMessage}`);
      }
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      setError('WebSocket connection error');
      setStatus('disconnected');
    };

    ws.onclose = (event) => {
      console.log(`WebSocket closed with code ${event.code}:`, event.reason);
      setStatus('disconnected');
      wsRef.current = null;
      
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        setRetryCountdown(3);
        console.log(`Attempting reconnect ${retryCountRef.current}/${MAX_RETRIES} in ${RETRY_DELAY}ms`);
        retryTimeoutRef.current = window.setTimeout(connect, RETRY_DELAY);
      } else {
        console.log('Max retry attempts reached');
        setError('Failed to establish WebSocket connection after multiple attempts');
      }
    };

  }, [url]);

  useEffect(() => {
    connect();

    return () => {
      clearRetryTimeout();
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, error, status, retryCountdown };
}