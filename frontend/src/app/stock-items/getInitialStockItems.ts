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

  try {
    const sessionStart = performance.now();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    // stock-items-ttfb-reduction Phase 0: 本番での cold 時 TTFB 内訳を
    // 判断するための観測性のみの追加。middleware.ts の Server-Timing と
    // 異なり、Server Component はレスポンスヘッダーを書けないため
    // console.log による構造化ログで代替する（既存の console.error による
    // observability パターンに倣う）。
    console.log(
      `getInitialStockItems: getSession;dur=${(performance.now() - sessionStart).toFixed(1)}`,
    );
    if (!session) return null;

    const fetchStart = performance.now();
    const items = await fetchStockItems(session.access_token, activeGroupId);
    console.log(
      `getInitialStockItems: fetchStockItems;dur=${(performance.now() - fetchStart).toFixed(1)}`,
    );
    return items;
  } catch {
    return null;
  }
}
