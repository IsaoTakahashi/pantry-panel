import { useEffect, useRef } from "react";
import { getSupabaseClient } from "./supabaseClient";

export function useStockItemsRealtime(onChange: () => void): void {
  // Ref ensures the subscription is never recreated when onChange changes
  // (e.g. when auth state loads and accessToken/activeGroupId update).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: onChangeRef is stable; subscription must not be recreated on callback changes
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    const channel = client
      .channel("stock-items-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_items" },
        () => onChangeRef.current(), // always calls the latest onChange
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (typeof window !== "undefined") {
            (
              window as unknown as Record<string, unknown>
            ).__supabaseRealtimeSubscribed = true;
          }
          onChangeRef.current();
        }
      });

    return () => {
      client.removeChannel(channel);
      if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, unknown>)
          .__supabaseRealtimeSubscribed;
      }
    };
  }, []);
}
