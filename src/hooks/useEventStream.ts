import { useEffect, useState } from "react";
import { resolveEventsWsUrl, type SentraEvent } from "../lib/events";

export function useEventStream(address?: `0x${string}` | "") {
  const normalized = address?.toLowerCase() ?? "";
  const [event, setEvent] = useState<SentraEvent | null>(null);

  useEffect(() => {
    if (!normalized) {
      setEvent(null);
      return;
    }
    let active = true;
    let ws: WebSocket | null = null;
    let retry: number | null = null;

    const url = resolveEventsWsUrl();

    const connect = () => {
      ws = new WebSocket(url);
      ws.onmessage = (message) => {
        try {
          const parsed = JSON.parse(message.data);
          const sender = parsed?.sender;
          if (
            typeof sender === "string" &&
            sender.toLowerCase() === normalized
          ) {
            setEvent(parsed as SentraEvent);
          }
        } catch {
          // ignore malformed messages
        }
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onclose = () => {
        if (!active) return;
        retry = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      active = false;
      if (retry) window.clearTimeout(retry);
      ws?.close();
    };
  }, [normalized]);

  return event;
}
