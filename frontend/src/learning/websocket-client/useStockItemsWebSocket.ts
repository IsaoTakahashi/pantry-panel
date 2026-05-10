import { useEffect, useState } from "react";
import { computeBackoff } from "./computeBackoff";
import type { StockItemEvent } from "./types";

export function useStockItemsWebSocket(url: string) {
  const [lastEvent, setLastEvent] = useState<StockItemEvent | null>(null);
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);

  useEffect(() => {
    let attempt = 0;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connect = () => {
      setReadyState(WebSocket.CONNECTING);
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempt = 0;
        setReadyState(WebSocket.OPEN);
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = event.data;

        try {
          const stockItemEvent = JSON.parse(data) as StockItemEvent;
          setLastEvent(stockItemEvent);
        } catch (e) {
          console.error(e);
        }
      };

      ws.onclose = () => {
        setReadyState(WebSocket.CLOSED);
        if (unmounted) return;
        const delay = computeBackoff(attempt);
        attempt++;
        timer = setTimeout(connect, delay);
      };
    };
    connect();

    return () => {
      unmounted = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [url]);

  return { lastEvent, readyState };
}
