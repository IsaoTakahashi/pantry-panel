import { cookies } from "next/headers";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";
import { fetchStockItems } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import type { StockItem } from "@/types/stockItem";

// stock-items ページの Server Component から呼ばれる（Issue #182）。cookie に
// 保存されたアクティブグループIDがあれば、Go API から商品一覧を取得して SSR
// HTML に埋め込む。cookie未設定・セッション未確認・API失敗のいずれの場合も
// null を返す（best-effort。クライアント側の useStockItems が通常の
// fetchフローにフォールバックするため、ここでは例外を投げない）。
export async function getInitialStockItems(): Promise<StockItem[] | null> {
  const cookieStore = await cookies();
  const activeGroupId = cookieStore.get(ACTIVE_GROUP_COOKIE_NAME)?.value;
  if (!activeGroupId) return null;

  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    // Server Component では cookie を書き換えられない（Server
    // Action/Route Handler/middleware 専用の API）。ここはセッションの
    // 読み取りのみが目的で、リフレッシュ結果の書き戻しは不要
    // （middleware が既にリフレッシュ・書き戻しを行っている）ため no-op。
    setAll: () => {},
  });
  if (!supabase) return null;

  // stock-items-ttfb-reduction Phase 0: 本番での cold 時 TTFB 内訳を判断する
  // ための観測性のみの追加。middleware.ts の Server-Timing と異なり、Server
  // Component はレスポンスヘッダーを書けないため console.log による構造化
  // ログで代替する。getSession() / fetchStockItems() いずれも reject し得る
  // ため、各区間を try/finally で個別に囲み、失敗時（catch 節に落ちる場合）
  // でも計測ログが欠落しないようにする。加えて、reject 時の所要時間ログは
  // 成功時と同一書式（`<name>;dur=<ms>`）になり数値だけでは「遅い成功」と
  // 「失敗」を区別できないため、reject したそれぞれのケースで
  // console.error によりエラーも記録する（middleware.ts の
  // claimsDurationMs 計測が console.error を併記するパターンとの一貫性）。
  let session: Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >["data"]["session"];
  try {
    const sessionStart = performance.now();
    try {
      const result = await supabase.auth.getSession();
      session = result.data.session;
    } catch (err) {
      console.error("getInitialStockItems: getSession threw", err);
      throw err;
    } finally {
      console.log(
        `getInitialStockItems: getSession;dur=${(performance.now() - sessionStart).toFixed(1)}`,
      );
    }
    if (!session) return null;

    const fetchStart = performance.now();
    try {
      return await fetchStockItems(session.access_token, activeGroupId);
    } catch (err) {
      console.error("getInitialStockItems: fetchStockItems threw", err);
      throw err;
    } finally {
      console.log(
        `getInitialStockItems: fetchStockItems;dur=${(performance.now() - fetchStart).toFixed(1)}`,
      );
    }
  } catch {
    return null;
  }
}
