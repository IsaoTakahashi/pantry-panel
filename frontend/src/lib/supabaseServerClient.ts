import { type CookieMethodsServer, createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// このファイルは意図的にモジュールレベルキャッシュを持たない
// （frontend/src/lib/supabaseClient.ts のブラウザ用クライアントとは逆の設計）。
//
// サーバー側クライアントはリクエストの cookie（セッション情報）に紐づくインスタンス
// であり、あるリクエストのために生成したクライアントを別のリクエストで使い回すと、
// 異なるユーザー・異なるセッションの cookie が混ざる恐れがある。そのため
// createSupabaseServerClient() は呼び出しごとに必ず新規のクライアントを生成する
// 関数として実装し、singleton や Promise キャッシュは一切持たない。
//
// cookie の読み書き方法は呼び出し側（middleware は NextRequest/NextResponse の
// cookie API、Route Handler は next/headers の cookies()）によって異なるため、
// このファイルは next/headers・next/server のどちらにも依存しない
// （CookieMethodsServer を引数として受け取るだけの薄いラッパーに留める）。

/**
 * サーバー側（middleware・Route Handler）用の Supabase クライアントを生成する。
 *
 * 呼び出しのたびに新規のクライアントを生成する。cookie はリクエストごとに異なるため、
 * このクライアントをモジュールスコープにキャッシュして使い回してはならない。
 *
 * @param cookies 呼び出し側が用意する cookie アクセサ（getAll は必須、setAll は
 *   トークンリフレッシュ結果を書き戻す場合に必要）
 * @returns Supabase env vars が未設定の場合は null（frontend/src/lib/supabaseClient.ts
 *   のブラウザ用クライアントと同じ convention）
 */
export function createSupabaseServerClient(
  cookies: CookieMethodsServer,
): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("Supabase env vars not set, server auth disabled");
    return null;
  }
  return createServerClient(url, key, { cookies });
}
