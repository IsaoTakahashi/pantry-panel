import { useEffect, useState } from "react";
import type { StockItemEvent } from "./types";

export function useStockItemsWebSocket(url: string) {
  const [lastEvent, setLastEvent] = useState<StockItemEvent | null>(null);
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
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
    };

    return () => {
      ws.close();
      setReadyState(WebSocket.CLOSED);
    };
  }, [url]);

  return { lastEvent, readyState };
}
