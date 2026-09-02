import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
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
    // resolve 後の処理をガードするフラグ。unmount が先に起きた場合、
    // resolve 後の subscribe を行わない（Issue #217 の単一購読 invariant を
    // 崩さないため）。
    let cancelled = false;
    let client: SupabaseClient | null = null;
    let channel: RealtimeChannel | undefined;

    // getSupabaseClient() の呼び出し自体は同期的に行う（Task 2 でモジュール
    // 評価時に既に発火済みの Promise を受け取るだけなので、ここでの呼び出し
    // タイミングを遅らせる必要はない）。
    getSupabaseClient().then((c) => {
      if (cancelled || !c) return;
      client = c;
      channel = c
        .channel("stock-items-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stock_items" },
          () => onChangeRef.current(), // INSERT/UPDATE/DELETE で最新 onChange を呼ぶ
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      // resolve 済み（client/channel が確定済み）なら removeChannel。
      // 未解決のまま unmount した場合は cancelled フラグを立てるだけで、
      // resolve 後のガードが subscribe 自体を防ぐ。
      if (client && channel) {
        client.removeChannel(channel);
      }
    };
  }, []);
}
