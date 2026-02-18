import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface OutageUpdate {
  type: "outage_update";
  outageCount: number;
  providers: string[];
  timestamp: string;
}

export function useOutagesWebSocket() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<OutageUpdate | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    function connect() {
      if (!isMounted) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws/outages`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setConnected(true);
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data) as OutageUpdate;
          if (data.type === "outage_update") {
            setLastUpdate(data);
            // Invalidate outage queries so map/list refresh
            queryClient.invalidateQueries({ queryKey: ["/api/outages"] });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 5 seconds
        reconnectTimerRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [queryClient]);

  return { connected, lastUpdate };
}
