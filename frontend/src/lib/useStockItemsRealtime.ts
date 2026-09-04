import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { getSupabaseClient, peekSupabaseClient } from "./supabaseClient";

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

    // 同期パス・非同期パスの両方から呼ぶ共通の subscribe 処理。cancelled
    // ガードと SUBSCRIBED-refetch（Issue #247 対応）を 1 箇所にまとめ、
    // 2 経路が個別に書かれて挙動が drift するのを防ぐ。
    function subscribe(c: SupabaseClient) {
      if (cancelled) return;
      client = c;
      channel = c
        .channel("stock-items-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stock_items" },
          () => onChangeRef.current(), // INSERT/UPDATE/DELETE で最新 onChange を呼ぶ
        )
        .subscribe((status) => {
          if (cancelled || status !== "SUBSCRIBED") return;
          // postgres_changes は SUBSCRIBED 到達前の変更を再送しないため、
          // マウント〜購読確立（再接続時は切断〜再購読）までの間に取りこぼした
          // 変更をここで拾う。SUBSCRIBED は再接続のたびに再度発火しうる。
          onChangeRef.current();
          // E2E が実 WebSocket の購読完了を観測する手段が他にないためのフラグ。
          if (typeof window === "undefined") return;
          (
            window as unknown as Record<string, unknown>
          ).__supabaseRealtimeSubscribed = true;
        });
    }

    // このフックは StockItemsClient のトップレベルで無条件に呼ばれる
    // （AuthGuard の children としてではない）ため、AuthGuard が session
    // を確定させるより前、ページ初回マウント時点で毎回この effect が発火する
    // ——「AuthGuard 配下だから getSupabaseClient() は解決済み」という前提は
    // 成立しない。それでも実測（Issue #247, 2026-09-04 の CI 計測）では
    // sync パスが大半のケースで発火している。これは動的 import が module
    // 評価時（≒ページの script 実行開始とほぼ同時）に発火するため、React の
    // hydration〜初回 effect flush が完了するまでの間にチャンク取得が終わって
    // いることが多い、という実際のネットワーク/実行タイミングの結果であり、
    // 保証ではない。peekSupabaseClient() で解決済みなら同じ tick で同期的に
    // subscribe し（Issue #247: main ブランチの完全同期な subscribe と
    // タイミングを揃え、SUBSCRIBED 到達前イベント取りこぼしのリスクを下げる）、
    // 未解決の場合は従来どおり非同期で待つ。async パスに落ちた場合の残存
    // リスクは Issue #247 に記録済み（83b1413 の SUBSCRIBED-refetch が
    // セーフティネットとして機能するが、完全な保証ではない）。
    const peeked = peekSupabaseClient();
    if (peeked !== undefined) {
      if (peeked) subscribe(peeked);
    } else {
      getSupabaseClient().then((c) => {
        if (c) subscribe(c);
      });
    }

    return () => {
      cancelled = true;
      // resolve 済み（client/channel が確定済み）なら removeChannel。
      // 未解決のまま unmount した場合は cancelled フラグを立てるだけで、
      // resolve 後のガードが subscribe 自体を防ぐ。
      if (client && channel) {
        client.removeChannel(channel);
      }
      if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, unknown>)
          .__supabaseRealtimeSubscribed;
      }
    };
  }, []);
}
