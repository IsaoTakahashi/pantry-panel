import { useEffect } from "react";
import { getSupabaseClient } from "./supabaseClient";

export function useStockItemsRealtime(onChange: () => void): void {
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    const channel = client
      .channel("stock-items-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_items" },
        onChange, // INSERT/UPDATE/DELETE で onChange を呼ぶ
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onChange();
      });

    return () => {
      client.removeChannel(channel);
    };
  }, [onChange]);
}
