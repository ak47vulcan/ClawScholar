"use client";

import { useEffect, useRef, useCallback } from "react";
import { WS_BASE } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

interface UseWebSocketOptions {
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
}

export function useWebSocket(path: string, options: UseWebSocketOptions) {
  const { onMessage, onOpen, onClose, autoReconnect = true, reconnectDelayMs = 3000 } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);
  const accessToken = useAuthStore((s) => s.accessToken);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    // Don't attempt to connect without a token; backend requires ?token=...
    if (!accessToken) return;
    const url = `${WS_BASE}${path}${accessToken ? `?token=${accessToken}` : ""}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isMountedRef.current) {
        onOpen?.();
        // Start keep-alive: backend expects plain "ping" text (not JSON)
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          } else {
            clearInterval(pingInterval);
          }
        }, 25000);
        (ws as WebSocket & { _pingInterval?: ReturnType<typeof setInterval> })._pingInterval = pingInterval;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (isMountedRef.current) onMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      // Clear keep-alive ping on close
      const pingInterval = (ws as WebSocket & { _pingInterval?: ReturnType<typeof setInterval> })._pingInterval;
      if (pingInterval) clearInterval(pingInterval);

      if (isMountedRef.current) {
        onClose?.();
        if (autoReconnect) {
          reconnectTimer.current = setTimeout(connect, reconnectDelayMs);
        }
      }
    };

    ws.onerror = () => ws.close();
  }, [path, accessToken, onMessage, onOpen, onClose, autoReconnect, reconnectDelayMs]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
