import type { CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

// 保護対象ルート（有効なセッション cookie が無ければ /login へリダイレクトする）。
// `/` は page.tsx が即座に /stock-items へ redirect() するため、保護対象に含める
// （そうしないと未ログインユーザーが /login に着地するまでに無駄なリダイレクトを
// 一往復挟むことになる）。
const PROTECTED_PATHS = ["/", "/stock-items", "/invite", "/no-group"];

// 認証と無関係なルート。ここに一致する場合は redirect 判定はもちろん、
// セッションリフレッシュ（Supabase への問い合わせ）自体も行わない。
// 特に /auth/callback は Task 4 で追加される OAuth コールバックルートであり、
// ここで余計な処理を挟んで壊してはならない。
const EXCLUDED_PATHS = ["/login", "/join", "/auth/callback"];

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  // setAll() が実際に呼ばれて cookie を書き換えた場合の Cache-Control 等の
  // header を控えておく。/login へリダイレクトする場合は response とは別の
  // NextResponse インスタンスを作るため、header・cookie をそちらにも
  // 反映しないと、書き換え結果（リフレッシュ後の新トークン、または失効
  // セッションのクリア）がブラウザに届かなくなる。
  let cacheHeaders: Record<string, string> = {};
  // setAll() は1リクエスト中に複数回呼ばれる可能性がある。response を
  // NextResponse.next({ request }) で毎回作り直すと、そのたびに Set-Cookie が
  // 空の状態からになるため、それまでの呼び出し分の cookie を累積しておき
  // 再構築のたびに全件書き直す（1回分だけ反映して他を黙って失う事故を防ぐ）。
  const pendingCookies: {
    name: string;
    value: string;
    options: CookieOptions;
  }[] = [];

  if (matchesPath(request.nextUrl.pathname, EXCLUDED_PATHS)) {
    return response;
  }

  const supabase = createSupabaseServerClient({
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet, headers) {
      // request にも書き戻すことで、この同一 middleware 実行内で以降 cookie を
      // 読む処理（例: 後続の supabase 呼び出し）が更新後の値を見られるようにする。
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }
      pendingCookies.push(...cookiesToSet);
      // response は request の最新状態を元に作り直す。NextResponse.next() を
      // 呼び直さないと、リフレッシュ後の cookie がブラウザに一切返らない
      // （supabaseServerClient.ts の JSDoc が警告する「setAll 誤実装」の一種）。
      response = NextResponse.next({ request });
      for (const { name, value, options } of pendingCookies) {
        response.cookies.set(name, value, options);
      }
      // 認証 cookie を含むレスポンスが CDN・リバースプロキシにキャッシュされ、
      // 別ユーザーに漏洩することを防ぐための header（Cache-Control 等）。
      // cookie 書き込みだけに使って捨てると事故るため必ず反映する。
      // headers は setAll のたびに同じ固定内容（Cache-Control 等）が渡されるため
      // 上書きで問題ない。
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }
      cacheHeaders = headers;
    },
  });

  // Supabase env vars が未設定の場合は fail open（REST CRUD など他の箇所と同じ convention）。
  if (!supabase) return response;

  // 未ログイン確定（redirect すべき）と判定するのは「セッションが本当に存在
  // しない」場合のみ。getClaims() は Supabase 側の一時的な障害（ネットワーク
  // エラー等）でも reject せず `{ data: null, error }` を resolve で返す
  // （@supabase/auth-js の GoTruClient.getClaims 実装: getSession() が
  // AuthRetryableFetchError 等の AuthError を返した場合は素通しで
  // `{ data: null, error }` を返すのみで throw しない）。そのため
  // `data === null` だけを見て redirect すると、一時障害時に保護ルートの
  // ユーザー全員が /login に飛ばされてしまう（S-8 が禁止する fail open 違反）。
  // 判定基準:
  //   - data !== null                      → 認証済み（pass）
  //   - data === null && error === null     → 本当に未ログイン（redirect 対象）
  //   - data === null && error !== null     → 判定不能（fail open、redirect しない）
  //   - 例外が飛んだ場合                     → 判定不能（fail open、redirect しない）
  let isDefinitelyUnauthenticated = false;
  try {
    // getClaims() はセッションの有効期限が近ければ内部でリフレッシュしてから
    // 検証する（getSession() はリフレッシュはするが cookie 由来の値を無条件に
    // 信頼してしまうため、サーバー側での認証チェックには非推奨とされている）。
    // クライアントを生成しただけではリフレッシュは走らないため、この呼び出しが
    // 必須。
    const { data, error } = await supabase.auth.getClaims();
    isDefinitelyUnauthenticated = data === null && error === null;
  } catch {
    // リフレッシュ処理自体が例外を投げても fail open。未ログイン扱いにはせず、
    // 「セッション状態が確認できなかった」として素通りさせる（保護ルートで
    // あってもリフレッシュ失敗だけを理由に /login へは飛ばさない）。
    return response;
  }

  if (
    isDefinitelyUnauthenticated &&
    matchesPath(request.nextUrl.pathname, PROTECTED_PATHS)
  ) {
    const loginUrl = new URL("/login", request.url);
    const redirectResponse = NextResponse.redirect(loginUrl);
    // setAll() で書き込まれた cookie（リフレッシュ結果や、失効セッションの
    // クリア）を redirect 用の新しい NextResponse にも引き継ぐ。ここで
    // response 側にしか反映しないと、上記の書き換えが黙って失われる。
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    for (const [key, value] of Object.entries(cacheHeaders)) {
      redirectResponse.headers.set(key, value);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 以下を除く全パスにマッチする:
     * - _next/static, _next/image（Next.js 内部アセット）
     * - favicon.ico, manifest.webmanifest, icon-192.png, icon-512.png, icon.svg, sw.js
     *   （Serwist の pre-cache 対象・PWA アセット。next.config.ts 参照）
     * - api（/api/health を含む。実 API は Go/Lambda 側の別サービスであり、
     *   このアプリの /api/* は health check 用の1ルートのみ。認証不要）
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icon-192\\.png|icon-512\\.png|icon\\.svg|sw\\.js|api/).*)",
  ],
};
