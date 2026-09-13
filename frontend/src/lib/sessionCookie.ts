import { createChunks, stringToBase64URL } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";

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
