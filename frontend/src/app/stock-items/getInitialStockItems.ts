import { stringFromBase64URL } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";
import { fetchStockItems, HttpError } from "@/lib/api";
import { readAccessTokenFromCookies } from "@/lib/sessionCookie";
import type { StockItem } from "@/types/stockItem";

// JWT payload の exp（秒）を読む。署名検証はしない（401 の分岐判定専用で、
// トークンの正当性は Go API が決める）。読み取れなければ null。
function readJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const parsed: unknown = JSON.parse(stringFromBase64URL(payload));
    const exp = (parsed as { exp?: unknown } | null)?.exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
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
  const logDur = () =>
    console.log(
      `getInitialStockItems: fetchStockItems;dur=${(performance.now() - fetchStart).toFixed(1)}`,
    );
  try {
    return await fetchStockItems(accessToken, activeGroupId);
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      // Go API の 401 がトークン無効の根拠。期限切れ（exp <= now）は一時的な
      // 更新失敗の可能性があるため null でクライアント取得に任せ、期限内 or
      // exp 不明なら確定的に無効としてセッションを消して /login へ送る。
      const exp = readJwtExp(accessToken);
      if (exp !== null && exp <= Math.floor(Date.now() / 1000)) {
        console.log(
          "getInitialStockItems: 401 with expired token, returning null",
        );
        return null;
      }
      console.log(
        "getInitialStockItems: 401 with unexpired token, redirecting to /auth/clear-session",
      );
      // redirect() は例外を投げる。catch 内からの throw はそのまま伝播し、
      // finally のログだけ走る（握りつぶさない）。
      redirect("/auth/clear-session");
    }
    console.error(
      "getInitialStockItems: fetchStockItems failed, returning null",
      err,
    );
    return null;
  } finally {
    logDur();
  }
}
