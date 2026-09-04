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

    // getSupabaseClient() は module 評価時に発火済みの Promise の singleton
    // を返すため、AuthGuard 配下（session 確定 = 既に一度 await 済み）では
    // ほぼ常に resolve 済み。peekSupabaseClient() でその場合を検出し、
    // 追加の非同期待ち（.then() の 1 microtask 以上の遅延）なしに同じ tick
    // で同期的に subscribe する（Issue #247: main ブランチの完全同期な
    // subscribe とタイミングを揃え、Realtime の SUBSCRIBED 到達前イベント
    // 取りこぼしリスクを増やさないため）。未解決の稀なケースのみ従来どおり
    // 非同期で待つ。
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
