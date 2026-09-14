import {
  combineChunks,
  createChunks,
  stringFromBase64URL,
  stringToBase64URL,
} from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";

const BASE64_PREFIX = "base64-";

export interface SessionCookie {
  name: string;
  value: string;
}

// @supabase/ssr のデフォルト cookieEncoding ("base64url") と cookie 名
// (`sb-{project-ref}-auth-token`) に合わせる。このアプリの
// createBrowserClient/createServerClient はどちらも cookieEncoding を
// 指定していないためデフォルトが使われる（frontend/src/lib/supabaseClient.ts,
// frontend/src/lib/supabaseServerClient.ts で確認済み）。
// frontend/e2e/global-setup.ts が Playwright storageState 用に同じ変換を
// 行っており、本ヘルパーはそれをテスト可能な形で切り出したもの。
export function buildSessionCookies(
  supabaseUrl: string,
  session: Session,
): SessionCookie[] {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieKey = `sb-${projectRef}-auth-token`;
  const encodedValue = `base64-${stringToBase64URL(JSON.stringify(session))}`;
  // MAX_CHUNK_SIZE を超える場合は sb-{ref}-auth-token.0 / .1 / ... に分割される。
  // 分割アルゴリズムは自前実装せず @supabase/ssr の実装をそのまま使う。
  return createChunks(cookieKey, encodedValue);
}

export function toCookieHeader(cookies: SessionCookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

// stock-items-ttfb-reduction Phase 2 (tasks.md 3.1): buildSessionCookies() の
// 逆変換。middleware が検証・リフレッシュ済みの cookie から、Supabase
// クライアントを介さずに access_token だけを読み取る（getInitialStockItems.ts
// から supabase.auth.getSession() 呼び出しを排除するための下位ヘルパー）。
// createChunks/combineChunks は @supabase/ssr の実装をそのまま使い、チャンク
// 分割・結合アルゴリズムを自前で再実装しない（buildSessionCookies と対称）。
//
// 失敗（cookie 未設定・base64url/JSON デコード失敗・access_token 欠落）は
// 例外を投げずすべて null で表す。呼び出し側（getInitialStockItems.ts）は
// best-effort フォールバックの一部としてこれを扱うため、判別可能な例外より
// null の方が呼び出し側を単純にできる。
export async function readAccessTokenFromCookies(
  supabaseUrl: string,
  getCookieValue: (name: string) => string | undefined,
): Promise<string | null> {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieKey = `sb-${projectRef}-auth-token`;

  let raw: string | null;
  try {
    raw = await combineChunks(
      cookieKey,
      async (chunkName) => getCookieValue(chunkName) ?? null,
    );
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const decoded = raw.startsWith(BASE64_PREFIX)
      ? stringFromBase64URL(raw.slice(BASE64_PREFIX.length))
      : raw;
    const parsed: unknown = JSON.parse(decoded);
    const accessToken = (parsed as { access_token?: unknown } | null)
      ?.access_token;
    return typeof accessToken === "string" ? accessToken : null;
  } catch {
    return null;
  }
}
