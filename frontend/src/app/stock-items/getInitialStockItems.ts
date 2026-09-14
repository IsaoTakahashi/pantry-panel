import { stringFromBase64URL } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";
import { fetchStockItems } from "@/lib/api";
import { readAccessTokenFromCookies } from "@/lib/sessionCookie";
import type { StockItem } from "@/types/stockItem";

const INITIAL_ITEMS_HEADER_NAME = "x-pp-initial-items";

// stock-items-ttfb-reduction Phase 2 (tasks.md 5.1): middleware.ts が
// Promise.all で並行取得した在庫データを x-pp-initial-items ヘッダー
// （base64url エンコードされた JSON 配列）経由で渡してきた場合、それを
// そのままデコードして返す。追加の cookie 読み取り・Supabase 呼び出し・
// Lambda 呼び出しは一切行わない（middleware が既に認証検証・データ取得の
// 両方を済ませているため）。
//
// デコード結果が配列でない場合（想定される JSON 形状と食い違う）は
// 「middleware側の異常」として扱い、null を返さずフォールバック取得に進む
// （tasks.md 5.2）。空配列 [] は「在庫が0件」という有効なデータであり、
// 「取得できなかった」という意味ではないため、配列である限りそのまま返す。
function tryReadInitialItemsHeader(
  headerValue: string | undefined,
): StockItem[] | undefined {
  if (!headerValue) return undefined;
  try {
    const decoded = stringFromBase64URL(headerValue);
    const parsed: unknown = JSON.parse(decoded);
    if (!Array.isArray(parsed)) {
      console.error(
        "getInitialStockItems: x-pp-initial-items header did not decode to an array, falling back",
      );
      return undefined;
    }
    return parsed as StockItem[];
  } catch (err) {
    console.error(
      "getInitialStockItems: failed to decode x-pp-initial-items header, falling back",
      err,
    );
    return undefined;
  }
}

// stock-items ページの Server Component から呼ばれる（Issue #182）。cookie に
// 保存されたアクティブグループIDがあれば、Go API から商品一覧を取得して SSR
// HTML に埋め込む。cookie未設定・access_token未確認・API失敗のいずれの場合も
// null を返す（best-effort。クライアント側の useStockItems が通常の
// fetchフローにフォールバックするため、ここでは例外を投げない）。
//
// stock-items-ttfb-reduction Phase 2 (tasks.md 3.1): 以前は
// supabase.auth.getSession() を呼んでいたが、Supabase クライアントの生成・
// 呼び出し自体を廃止した。middleware.ts が getClaims() で既に検証・
// リフレッシュ済みの auth-token cookie を、Supabase を介さず直接
// readAccessTokenFromCookies() でパースして access_token を取り出す
// （Server Component はどのみち cookie を書き換えられずリフレッシュは
// 行えないため、ここで Supabase クライアントを生成する理由が元々無かった）。
export async function getInitialStockItems(): Promise<StockItem[] | null> {
  const headerStore = await headers();
  const initialItems = tryReadInitialItemsHeader(
    headerStore.get(INITIAL_ITEMS_HEADER_NAME) ?? undefined,
  );
  if (initialItems !== undefined) return initialItems;

  // stock-items-ttfb-reduction Phase 2 (tasks.md 5.2): ヘッダーが無い場合
  // （サイズ超過・フェッチ失敗・middleware側の異常等）のフォールバック取得。
  // spec.md MUST: 認証検証をやり直さない。readAccessTokenFromCookies は
  // middleware が検証・リフレッシュ済みの cookie をローカルで読むだけで
  // あり、Supabase への問い合わせ（＝認証検証のやり直し）は発生しない。
  const cookieStore = await cookies();
  const activeGroupId = cookieStore.get(ACTIVE_GROUP_COOKIE_NAME)?.value;
  if (!activeGroupId) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  // stock-items-ttfb-reduction Phase 0/2: 本番での cold 時 TTFB 内訳を判断する
  // ための観測性。Server Component はレスポンスヘッダーを書けないため
  // console.log による構造化ログで代替する（middleware.ts の Server-Timing と
  // 対になる）。reject時は成功時と同じ書式のログだけでは区別できないため、
  // console.error でエラー内容も記録する。
  const tokenStart = performance.now();
  let accessToken: string | null;
  try {
    accessToken = await readAccessTokenFromCookies(
      supabaseUrl,
      (name) => cookieStore.get(name)?.value,
    );
  } catch (err) {
    console.error(
      "getInitialStockItems: readAccessTokenFromCookies threw",
      err,
    );
    accessToken = null;
  } finally {
    console.log(
      `getInitialStockItems: readAccessTokenFromCookies;dur=${(performance.now() - tokenStart).toFixed(1)}`,
    );
  }
  if (!accessToken) return null;

  const fetchStart = performance.now();
  try {
    return await fetchStockItems(accessToken, activeGroupId);
  } catch (err) {
    console.error("getInitialStockItems: fetchStockItems threw", err);
    return null;
  } finally {
    console.log(
      `getInitialStockItems: fetchStockItems;dur=${(performance.now() - fetchStart).toFixed(1)}`,
    );
  }
}
