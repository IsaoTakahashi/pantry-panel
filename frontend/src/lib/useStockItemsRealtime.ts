import { useEffect, useRef } from "react";
import { getSupabaseClient } from "./supabaseClient";

export function useStockItemsRealtime(onChange: () => void): void {
  // 常に最新の onChange を参照するための ref。これによりチャンネルを
  // 1 度だけ生成し、accessToken / activeGroupId 変更で再 subscribe しない。
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // deps は [] 固定。チャンネルはマウント時に 1 度だけ生成し、
  // アンマウント時にのみ片付ける。
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    const channel = client
      .channel("stock-items-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_items" },
        () => onChangeRef.current(), // INSERT/UPDATE/DELETE で最新 onChange を呼ぶ
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);
}
