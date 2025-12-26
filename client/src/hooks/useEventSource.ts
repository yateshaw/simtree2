import { useState, useEffect, useRef, useCallback } from 'react';

interface SSEOptions {
  url?: string;
  withCredentials?: boolean;
  reconnectInterval?: number;
  maxRetries?: number;
  onOpen?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (event: MessageEvent) => void;
  enabled?: boolean;
}

/**
 * Custom hook for Server-Sent Events (SSE) with automatic reconnection
 */
export const useEventSource = ({
  url = '/api/events',
  withCredentials = true,
  reconnectInterval = 5000,
  maxRetries = 5,
  onOpen,
  onError,
  onMessage,
  enabled = true,
}: SSEOptions = {}) => {
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [error, setError] = useState<Event | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);

  // Clear any pending reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Close the event source connection
  const close = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setStatus('closed');
      clearReconnectTimeout();
    }
  }, [clearReconnectTimeout]);

  // Store callbacks in refs to prevent dependency changes
  const onOpenRef = useRef(onOpen);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);
  
  // Update refs when callbacks change
  useEffect(() => {
    onOpenRef.current = onOpen;
    onErrorRef.current = onError;
    onMessageRef.current = onMessage;
  }, [onOpen, onError, onMessage]);

  // Connect to the SSE endpoint
  const connect = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      setStatus('connecting');
      
      const eventSource = new EventSource(url, { withCredentials });
      eventSourceRef.current = eventSource;
      
      eventSource.onopen = () => {
        setStatus('open');
        setError(null);
        retryCountRef.current = 0;
        if (onOpenRef.current) onOpenRef.current();
      };
      
      eventSource.onerror = (event) => {
        console.error('SSE: Connection error', event);
        setError(event);
        eventSource.close();
        eventSourceRef.current = null;
        
        // Implement reconnection logic with back-off
        if (retryCountRef.current < maxRetries) {
          const retryDelay = reconnectInterval * Math.pow(1.5, retryCountRef.current);
          
          clearReconnectTimeout();
          timeoutRef.current = window.setTimeout(() => {
            retryCountRef.current++;
            connect();
          }, retryDelay);
        } else {
          setStatus('closed');
        }
        
        if (onErrorRef.current) onErrorRef.current(event);
      };
      
      eventSource.onmessage = (event) => {
        try {
          if (event.data && event.data !== '') {
            const data = JSON.parse(event.data);
            setEvents((prev) => [...prev, data]);
            if (onMessageRef.current) onMessageRef.current(event);
          }
        } catch (err) {
          console.error('SSE: Error parsing event data', err, event.data);
        }
      };
    } catch (err) {
      console.error('SSE: Failed to create EventSource', err);
      setStatus('closed');
      setError(err as any);
      
      // Try to reconnect
      if (retryCountRef.current < maxRetries) {
        clearReconnectTimeout();
        timeoutRef.current = window.setTimeout(() => {
          retryCountRef.current++;
          connect();
        }, reconnectInterval);
      }
    }
  }, [url, withCredentials, reconnectInterval, maxRetries, enabled, clearReconnectTimeout]);

  // Listen for logout events to close the connection
  useEffect(() => {
    const handleLogoutStarting = () => {
      close();
    };

    window.addEventListener('logout-starting', handleLogoutStarting);
    
    return () => {
      window.removeEventListener('logout-starting', handleLogoutStarting);
    };
  }, [close]);

  // Initialize the connection when the hook is first used
  useEffect(() => {
    if (enabled) {
      connect();
    }
    
    return () => {
      close();
    };
  }, [connect, close, enabled]);

  // Function to clear events without reconnecting
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    status,
    error,
    events,
    close,
    connect,
    clearEvents
  };
};