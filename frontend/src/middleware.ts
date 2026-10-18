import type { CookieOptions } from "@supabase/ssr";
import {
  isAuthRefreshDiscardedError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE_PATTERN } from "@/lib/authCookie";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

// stock-items-single-fetch (design.md D1): /stock-items だけは getClaims()
// ではなく getSession() でセッションを判定する。getClaims() は署名検証のため
// JWKS を取得する（cold 時に数百 ms）が、/stock-items の page は直後に Go API
// を呼び、Go API 自身が JWT を検証する（＝認証の最終的な境界）。そのため
// middleware では「期限内なら cookie を読むだけで通す、期限切れなら更新する」
// getSession() で足りる。子パス（/stock-items/...）は対象外とし、完全一致のみ。
const STOCK_ITEMS_PATH = "/stock-items";

// 保護対象ルート（有効なセッション cookie が無ければ /login へリダイレクトする）。
// `/` は page.tsx が即座に /stock-items へ redirect() するため、保護対象に含める
// （そうしないと未ログインユーザーが /login に着地するまでに無駄なリダイレクトを
// 一往復挟むことになる）。
const PROTECTED_PATHS = ["/", "/stock-items", "/invite", "/no-group"];

// 認証と無関係なルート。ここに一致する場合は redirect 判定はもちろん、
// セッションリフレッシュ（Supabase への問い合わせ）自体も行わない。
// - /auth/callback は OAuth コールバックルートであり、ここで余計な処理を
//   挟んで壊してはならない。
// - /auth/clear-session は auth cookie を失効させて /login へ送る Route
//   Handler（page が Go API の 401 を受けたときの遷移先）。ここをセッション
//   判定に通すと、判定結果次第で middleware 自身が別の場所へリダイレクトし、
//   cookie を消す前に遷移がループしうるため除外する。
const EXCLUDED_PATHS = [
  "/login",
  "/join",
  "/auth/callback",
  "/auth/clear-session",
];

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// stock-items-ttfb-reduction Phase 0 で追加した観測性。本番での TTFB 内訳を
// 実測するため、セッション判定の所要時間を Server-Timing に載せる。
// Server-Timing はレスポンスヘッダーとして仕様化された形式
// （`<name>;dur=<ミリ秒>`、複数区間はカンマ区切り）に従う。
// 区間名は歴史的経緯で "claims" のままだが、/stock-items では getSession() の
// 所要時間を表す（stock-items-single-fetch design.md D6）。
function appendServerTiming(
  res: NextResponse,
  name: string,
  durationMs: number,
): void {
  const entry = `${name};dur=${durationMs.toFixed(1)}`;
  const existing = res.headers.get("Server-Timing");
  res.headers.set("Server-Timing", existing ? `${existing}, ${entry}` : entry);
}

// セッション判定の結果。
// - authenticated: 認証済み（x-pp-authenticated を付けて通す）
// - unauthenticated: 未ログイン確定（保護ルートなら cookie を消して /login）
// - undetermined: 判定不能（fail open。redirect せず、ヘッダーも付けない）
type SessionOutcome = "authenticated" | "unauthenticated" | "undetermined";

// getClaims() / getSession() はどちらも、Supabase 側の一時的な障害
// （ネットワークエラー等）でも reject せず `{ data, error }` を resolve で返す
// （@supabase/auth-js の実装）。そのため「データが無い」ことだけを見て
// redirect すると、一時障害時に保護ルートのユーザー全員が /login に飛ばされて
// しまう（fail open 違反）。一方で、エラーの種類を見ずに常に fail open すると、
// セッションが明確に無効な場合まで通過させてしまう。判定基準:
//   - データあり                                   → 認証済み
//   - データなし && error === null                  → 本当に未ログイン
//   - データなし && error は Retryable/RefreshDiscarded → 判定不能（fail open）
//   - データなし && error はそれ以外                → 未ログイン確定扱い
// 例外が飛んだ場合の fail open は呼び出し側で扱う。
//
// AuthRefreshDiscardedError を fail open 側に含める理由: このエラーは
// 「サーバーはリフレッシュトークンのローテーションに成功したが、クライアントが
// ローテーション後のトークンを永続化する直前にローカルのセッション状態が
// 変わった（例: 別タブでの同時 signOut）ため保存を見送った」ことを示す
// （@supabase/auth-js の errors.js の doc comment より）。トークン自体が無効な
// わけではなく、次のリクエストで解消する一時的な競合状態。
function classifySessionResult(
  method: "getClaims" | "getSession",
  hasSession: boolean,
  error: unknown,
): SessionOutcome {
  if (hasSession) return "authenticated";
  if (error === null || error === undefined) return "unauthenticated";
  if (isAuthRetryableFetchError(error) || isAuthRefreshDiscardedError(error)) {
    // fail open するが、原因不明のまま黙って保護ルートの認証チェックが
    // 無効化され続けると気づけない（持続的な Supabase 障害・設定ミス等）
    // ため、observability のためにログを残す。
    console.error(
      `middleware: ${method} resolved with an error, failing open (session refresh not confirmed)`,
      error,
    );
    return "undetermined";
  }
  // Retryable でも RefreshDiscarded でもないエラー（例: AuthInvalidJwtError、
  // 無効な refresh token による AuthApiError）は、リトライしても解消しない
  // 「セッションが有効ではない」ケースとみなし、未ログイン確定として扱う。
  console.error(
    `middleware: ${method} resolved with a definitively invalid error, redirecting to /login`,
    error,
  );
  return "unauthenticated";
}

export async function middleware(request: NextRequest) {
  // クライアントが x-pp-authenticated を偽装して送ってきた場合に、下流の
  // Server Component（layout.tsx）がそれを「middleware が判定済み」と誤って
  // 信頼しないよう、response を組み立てる前に必ず一度取り除く（Issue #182）。
  // 認証済みと判定できたときだけ、この関数が改めて付与し直す。
  request.headers.delete("x-pp-authenticated");
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

  // request.headers への書き込みを下流（layout.tsx）に伝えるには
  // NextResponse.next({ request }) を呼び直して response を作り直す必要がある
  // （Next.js は呼び出し時点の request.headers を元に転送用 header をエンコード
  // するため、response 構築後の request 変更は反映されない）。ただし作り直すと
  // setAll()（getClaims() / getSession() 内部でのセッションリフレッシュ）が
  // 既に response に積んでいた Set-Cookie / Cache-Control が失われるため、
  // setAll() と同じパターンで pendingCookies・cacheHeaders を積み直す。
  function rebuildResponseFromRequest(): void {
    response = NextResponse.next({ request });
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }
    for (const [key, value] of Object.entries(cacheHeaders)) {
      response.headers.set(key, value);
    }
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

  // /stock-items は getSession()（期限内なら通信なし、期限切れなら refresh
  // token で更新し setAll() で cookie を書き戻す）、それ以外は getClaims()
  // （必要ならリフレッシュしたうえで署名を検証する）。どちらもクライアントを
  // 生成しただけではリフレッシュは走らないため、この呼び出しが必須。
  // middleware は Go API を呼ばない（在庫の先読みは廃止。design.md D2）。
  const useGetSession = request.nextUrl.pathname === STOCK_ITEMS_PATH;
  const method = useGetSession ? "getSession" : "getClaims";
  let outcome: SessionOutcome;
  const claimsStart = performance.now();
  try {
    if (useGetSession) {
      const { data, error } = await supabase.auth.getSession();
      outcome = classifySessionResult(method, data?.session != null, error);
    } else {
      const { data, error } = await supabase.auth.getClaims();
      outcome = classifySessionResult(method, data !== null, error);
    }
  } catch (err) {
    // リフレッシュ処理自体が例外を投げても fail open。未ログイン扱いにはせず、
    // 「セッション状態が確認できなかった」として素通りさせる（保護ルートで
    // あってもリフレッシュ失敗だけを理由に /login へは飛ばさない）。
    console.error(
      `middleware: ${method} threw, failing open (session refresh not confirmed)`,
      err,
    );
    outcome = "undetermined";
  }
  const claimsDurationMs = performance.now() - claimsStart;

  if (outcome === "authenticated") {
    // 認証済みと判定できた事実を Server Component（layout.tsx）へ転送する
    // （Issue #182）。下流の Server Component が同じ判定をもう一度行う
    // （＝二重のネットワーク呼び出し）のを避けるため、ヘッダー経由で結果だけを
    // 渡す。/stock-items では getSession() は署名を検証しないため、この値は
    // 画面の初期状態のヒントにのみ使う（データは Go API の検証を通らないと
    // 取れない。spec ssr-session-auth）。
    request.headers.set("x-pp-authenticated", "1");
    rebuildResponseFromRequest();
  }

  appendServerTiming(response, "claims", claimsDurationMs);

  if (
    outcome === "unauthenticated" &&
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
    // ブラウザ側の createBrowserClient（supabaseClient.ts）は middleware と
    // 同じ cookie ストアを読むため、失効させずに残すと未ログイン確定後も
    // ブラウザがセッションありと誤判定し、/login → 保護ルートへ押し戻す
    // redirect ループになる（Issue #260）。上記コピーループの後に実行する
    // 必要がある（先に実行すると request 由来の生きた cookie で上書きされる）。
    for (const cookie of request.cookies.getAll()) {
      if (AUTH_TOKEN_COOKIE_PATTERN.test(cookie.name)) {
        redirectResponse.cookies.set(cookie.name, "", {
          path: "/",
          maxAge: 0,
        });
      }
    }
    for (const [key, value] of Object.entries(cacheHeaders)) {
      redirectResponse.headers.set(key, value);
    }
    appendServerTiming(redirectResponse, "claims", claimsDurationMs);
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
     * - api（/api/health, /api/warm/stock-items を含む。実 API は Go/Lambda
     *   側の別サービスであり、このアプリの /api/* は health check・warm-up
     *   用のルートのみ。認証不要。/api/warm/stock-items は自前の共有シークレット
     *   検証で保護される）
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icon-192\\.png|icon-512\\.png|icon\\.svg|sw\\.js|api/).*)",
  ],
};
