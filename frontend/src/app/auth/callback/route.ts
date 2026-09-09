import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

// OAuth 成功時のデフォルト遷移先。`next` クエリパラメータが未指定・不正な
// 場合はここへフォールバックする。
const DEFAULT_NEXT_PATH = "/stock-items";

// exchangeCodeForSession 失敗・code 欠如時の遷移先。login/page.tsx（Task 6.5）
// がこの error クエリパラメータを読んでエラーメッセージを表示する想定。
// Supabase の生エラーメッセージは URL に載せず、固定のエラーコードのみ渡す。
const LOGIN_ERROR_PATH = "/login?error=auth_callback_failed";

/**
 * `next` クエリパラメータ（攻撃者が自由に指定できる）を検証し、安全な同一
 * オリジンの URL であればそれを返し、そうでなければデフォルトへフォール
 * バックする（オープンリダイレクト対策）。
 *
 * **戻り値は `URL` オブジェクトそのものであり、文字列に再構築しない。**
 * 過去のバージョンでは `` `${resolved.pathname}${resolved.search}${resolved.hash}` ``
 * のように文字列を再構築して返し、呼び出し側で `new URL(next, request.url)`
 * として再度パースしていたが、これは2回目のパースが独立した入力になる
 * ため脆弱だった。例えば `next=/..//evil.com` は1回目のパース時点では
 * `..` のパス正規化によって pathname が `//evil.com` に潰れるが、この時点
 * ではまだ同一オリジン（`resolved.origin` は自分自身のまま）であり安全。
 * しかしこの pathname だけを文字列として取り出し、単独で `new URL()` に
 * 再度渡すと、今度は `//evil.com` が単独の入力としてプロトコル相対URLと
 * 解釈され、host が evil.com に解決されてしまう（実機で確認済み）。
 * この「検証した値」と「実際にリダイレクトする値」が2回の別々のパースで
 * 食い違う問題を、URL オブジェクトをそのまま返して再パースを排除すること
 * で解消する。
 *
 * 単純な文字列判定（"//" で始まらない・"://" を含まない等）だけでも、WHATWG
 * URL パーサーが特別スキーム（http/https）においてバックスラッシュを "/" として
 * 正規化する挙動をすり抜けられる（例: "/\evil.com" は "//evil.com" と同様に
 * host が evil.com に解決される）。そのため実際に `new URL()` で解決し、結果の
 * origin がリクエスト自身の origin と一致するかで最終判定する。
 */
function resolveNextUrl(nextParam: string | null, requestUrl: string): URL {
  const fallback = new URL(DEFAULT_NEXT_PATH, requestUrl);
  if (!nextParam?.startsWith("/") || nextParam.startsWith("//")) {
    return fallback;
  }
  try {
    const resolved = new URL(nextParam, requestUrl);
    const base = new URL(requestUrl);
    if (resolved.origin !== base.origin) {
      return fallback;
    }
    return resolved;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextUrl = resolveNextUrl(
    request.nextUrl.searchParams.get("next"),
    request.url,
  );

  const cookieStore = await cookies();
  // setAll() が渡す Cache-Control 等の header を保管しておき、レスポンスにも
  // 適用する（supabaseServerClient.ts の JSDoc 参照）。認証 cookie を含む
  // レスポンスが CDN・リバースプロキシにキャッシュされることを防ぐ。
  let cacheHeaders: Record<string, string> = {};

  if (!code) {
    const errorResponse = NextResponse.redirect(
      new URL(LOGIN_ERROR_PATH, request.url),
    );
    for (const [key, value] of Object.entries(cacheHeaders)) {
      errorResponse.headers.set(key, value);
    }
    return errorResponse;
  }

  const supabase = createSupabaseServerClient({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet, headers) {
      // cookies() は Route Handler のリクエスト/レスポンスサイクルに紐づく
      // ため、ここで書き込んだ cookie は Next.js のルートモジュールが
      // ハンドラの戻り値（NextResponse）に自動的に Set-Cookie として反映する。
      for (const { name, value, options } of cookiesToSet) {
        cookieStore.set(name, value, options);
      }
      cacheHeaders = { ...cacheHeaders, ...headers };
    },
  });

  // Supabase env vars が未設定の場合は他の箇所と同じ convention（フロント側の
  // 動作確認等でも起こりうるため、失敗パスと同じ /login へ寄せる）。
  if (!supabase) {
    const errorResponse = NextResponse.redirect(
      new URL(LOGIN_ERROR_PATH, request.url),
    );
    for (const [key, value] of Object.entries(cacheHeaders)) {
      errorResponse.headers.set(key, value);
    }
    return errorResponse;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorResponse = NextResponse.redirect(
      new URL(LOGIN_ERROR_PATH, request.url),
    );
    for (const [key, value] of Object.entries(cacheHeaders)) {
      errorResponse.headers.set(key, value);
    }
    return errorResponse;
  }

  const redirectResponse = NextResponse.redirect(nextUrl);
  // Cache-Control 等の header は cookies() 経由では自動反映されないため、
  // ここで明示的にレスポンスへ適用する（cookie の Set-Cookie 自体は自動反映
  // されるが、header はレスポンスオブジェクトを直接触る必要がある）。
  for (const [key, value] of Object.entries(cacheHeaders)) {
    redirectResponse.headers.set(key, value);
  }
  return redirectResponse;
}
