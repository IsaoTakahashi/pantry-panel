import type { CookieOptions } from "@supabase/ssr";
import {
  isAuthRefreshDiscardedError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
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
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }
      // @supabase/ssr は setAll のたびに同じ固定内容（Cache-Control 等）を渡す
      // ため上書きでも実害はないが、その内部実装への暗黙の依存を無くすため
      // 上書きではなくマージしておく。
      cacheHeaders = { ...cacheHeaders, ...headers };
    },
  });

  // Supabase env vars が未設定の場合は fail open（REST CRUD など他の箇所と同じ convention）。
  if (!supabase) return response;

  // 未ログイン確定（redirect すべき）と判定するのは「セッションが本当に存在
  // しない」場合と、「resolve されたエラーが fail-open 対象の2クラスに該当
  // しない」場合。getClaims() は Supabase 側の一時的な障害（ネットワーク
  // エラー等）でも reject せず `{ data: null, error }` を resolve で返す
  // （@supabase/auth-js の GoTruClient.getClaims 実装: getSession() が
  // AuthRetryableFetchError 等の AuthError を返した場合は素通しで
  // `{ data: null, error }` を返すのみで throw しない）。そのため
  // `data === null` だけを見て redirect すると、一時障害時に保護ルートの
  // ユーザー全員が /login に飛ばされてしまう（S-8 が禁止する fail open 違反）。
  // 一方で、resolve されたエラーの種類を一切見ずに常に fail open すると、
  // JWT が明確に無効（署名不正・期限切れ等）な場合まで通過させてしまう。
  // 判定基準:
  //   - data !== null                                → 認証済み（pass）
  //   - data === null && error === null               → 本当に未ログイン（redirect 対象）
  //   - data === null && error は Retryable/RefreshDiscarded → 判定不能（fail open、redirect しない）
  //   - data === null && error はそれ以外              → 未ログイン確定扱い（redirect 対象）
  //   - 例外が飛んだ場合                                → 判定不能（fail open、redirect しない）
  let isDefinitelyUnauthenticated = false;
  try {
    // getClaims() はセッションの有効期限が近ければ内部でリフレッシュしてから
    // 検証する（getSession() はリフレッシュはするが cookie 由来の値を無条件に
    // 信頼してしまうため、サーバー側での認証チェックには非推奨とされている）。
    // クライアントを生成しただけではリフレッシュは走らないため、この呼び出しが
    // 必須。
    const { data, error } = await supabase.auth.getClaims();
    if (data === null && error === null) {
      isDefinitelyUnauthenticated = true;
    } else if (data === null && error !== null) {
      if (
        isAuthRetryableFetchError(error) ||
        isAuthRefreshDiscardedError(error)
      ) {
        // fail open するが、原因不明のまま黙って保護ルートの認証チェックが
        // 無効化され続けると気づけない（持続的な Supabase 障害・設定ミス・
        // リフレッシュ処理自体のバグ等）。挙動は変えず observability のみ追加。
        //
        // AuthRefreshDiscardedError を fail open 側に含める理由: このエラーは
        // 「サーバーはリフレッシュトークンのローテーションに成功したが、
        // クライアントがローテーション後のトークンを永続化する直前に
        // ローカルのセッション状態が変わった（例: 別タブでの同時 signOut）
        // ため保存を見送った」ことを示す（@supabase/auth-js の errors.js の
        // doc comment より）。トークン自体が無効なわけではなく、次のリクエスト
        // で解消する一時的な競合状態。ここで redirect すると、別タブでの
        // サインアウトがこのタブのリフレッシュとたまたま競合しただけの
        // ユーザーを誤って追い出してしまう。
        console.error(
          "middleware: getClaims resolved with an error, failing open (session refresh not confirmed)",
          error,
        );
      } else {
        // Retryable でも RefreshDiscarded でもない resolve エラー（例:
        // AuthInvalidJwtError）は、リトライしても解消しない明確な判定不能
        // ではなく「セッションが有効ではない」ケースとみなし、未ログイン
        // 確定として扱う。
        isDefinitelyUnauthenticated = true;
      }
    }
  } catch (err) {
    // リフレッシュ処理自体が例外を投げても fail open。未ログイン扱いにはせず、
    // 「セッション状態が確認できなかった」として素通りさせる（保護ルートで
    // あってもリフレッシュ失敗だけを理由に /login へは飛ばさない）。
    // 挙動は変えず observability のみ追加。
    console.error(
      "middleware: getClaims threw, failing open (session refresh not confirmed)",
      err,
    );
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
