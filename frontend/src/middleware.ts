import { type CookieOptions, stringToBase64URL } from "@supabase/ssr";
import {
  isAuthRefreshDiscardedError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";
import { fetchStockItems } from "@/lib/api";
import { readAccessTokenFromCookies } from "@/lib/sessionCookie";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import type { StockItem } from "@/types/stockItem";

// stock-items-ttfb-reduction Phase 2 (tasks.md 4.1): getInitialStockItems()
// が呼ばれるのは /stock-items の SSR だけであるため、それ以外のパスで
// Go Lambda への在庫データフェッチを発射しても無駄な待ち時間・バックエンド
// 負荷にしかならない（design.md はこの区別を明示していないが、実装上の
// 必然として追加する）。
const STOCK_ITEMS_PATH = "/stock-items";

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

// @supabase/ssr の cookie 名パターン。project ref を含むため固定名では
// 拾えず、かつ大きなセッションはチャンク分割される（`.0`, `.1` ...）ため
// 数値サフィックスも許容する（Issue #260）。
const AUTH_TOKEN_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// stock-items-ttfb-reduction Phase 0: 本番での cold 時 TTFB 内訳を実測する
// ための観測性のみの追加（判断ゲート）。既存の fail-open/fail-closed 判定・
// redirect 分岐・cookie/ヘッダー付与ロジックは変更しない。
// Server-Timing はレスポンスヘッダーとして仕様化された形式
// （`<name>;dur=<ミリ秒>`、複数区間はカンマ区切り）に従う。
function appendServerTiming(
  res: NextResponse,
  name: string,
  durationMs: number,
): void {
  const entry = `${name};dur=${durationMs.toFixed(1)}`;
  const existing = res.headers.get("Server-Timing");
  res.headers.set("Server-Timing", existing ? `${existing}, ${entry}` : entry);
}

// stock-items-ttfb-reduction Phase 2 (tasks.md 4.2): middleware で並行取得
// した在庫データを x-pp-initial-items ヘッダー経由で page（Server Component）
// に引き継ぐ。HTTPヘッダー値は生の JSON をそのまま渡すと日本語等の非ASCII
// 文字がヘッダーのシリアライズ層で壊れる/例外になる恐れがあるため、
// @supabase/ssr が cookie 値の格納に使っているのと同じ base64url エンコード
// を使う（sessionCookie.ts と対称）。
//
// サイズ閾値（暫定6KiB、design.md Open Questions）はこのエンコード後の
// 文字列に対して適用する。base64url のアルファベットは ASCII のみなので、
// 文字数＝バイト数であり、実際にヘッダーとして送出されるバイト数を直接
// 数えられる（base64 はエンコードで約1.33倍に膨らむため、元のJSON文字列の
// 長さに対して閾値を適用すると実際のヘッダーサイズを過小評価してしまう）。
const MAX_INITIAL_ITEMS_HEADER_BYTES = 6 * 1024;

function serializeStockItemsForHeader(
  items: StockItem[] | undefined,
): string | undefined {
  if (items === undefined) return undefined;
  const encoded = stringToBase64URL(JSON.stringify(items));
  if (encoded.length > MAX_INITIAL_ITEMS_HEADER_BYTES) return undefined;
  return encoded;
}

export async function middleware(request: NextRequest) {
  // クライアントが x-pp-authenticated を偽装して送ってきた場合に、下流の
  // Server Component（layout.tsx）がそれを「middleware が検証済み」と誤って
  // 信頼しないよう、response を組み立てる前に必ず一度取り除く（Issue #182）。
  // 認証済みと判定できたときだけ、この関数が改めて付与し直す。
  // x-pp-initial-items も同じ理由で取り除く（tasks.md 4.2）。クライアントが
  // このヘッダーを偽装しても実害は認証情報の漏洩ではないが、middleware が
  // 実際に取得していないデータを getInitialStockItems.ts が信頼してしまう
  // 経路を作らないため、他の内部専用ヘッダーと同じ扱いにする。
  request.headers.delete("x-pp-authenticated");
  request.headers.delete("x-pp-initial-items");
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

  // request.headers への書き込みを下流（layout.tsx / getInitialStockItems.ts）
  // に伝えるには NextResponse.next({ request }) を呼び直して response を
  // 作り直す必要がある（Next.js は呼び出し時点の request.headers を元に
  // 転送用 header をエンコードするため、response 構築後の request 変更は
  // 反映されない）。ただし作り直すと setAll()（getClaims() 内部でのセッション
  // リフレッシュ）が既に response に積んでいた Set-Cookie / Cache-Control が
  // 失われるため、setAll() と同じパターンで pendingCookies・cacheHeaders を
  // 積み直す（S-7 回帰）。x-pp-authenticated（既存）・x-pp-initial-items
  // （tasks.md 4.2/4.4）のどちらを request に付与する場合も、この再構築が
  // 必要という点は同じなので共通化する。
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
  // stock-items-ttfb-reduction Phase 2 (tasks.md 4.1): 認証検証(getClaims())
  // と Go Lambda への在庫データフェッチ(fetchStockItems())を並列発射する。
  // どちらも await する前に開始しておく必要があるため、claimsPromise /
  // stockItemsPromise は Promise.all に渡す直前まで一切 await しない。
  //
  // stockItemsPromise は内部で自分の失敗を握り込み（.catch 相当の分岐で
  // undefined を返す）、決して reject しない。これにより Promise.all は
  // claimsPromise が reject したときだけ reject し、Lambda 側の失敗が
  // 認証検証の既存のエラーハンドリング（fail-open/fail-closed の分岐）に
  // 影響しないようにする。
  //
  // 上記の「握り込み」は fetchStockItems() 自体の失敗（下記 IIFE 内の
  // try/catch）にしか及ばない。IIFE 内でそれより前の処理（例:
  // readAccessTokenFromCookies() が不正な Supabase URL で `new URL()` から
  // 投げる等、想定していない今後の変更を含む）が例外を投げた場合、この
  // try/catch には引っかからず IIFE 自身が reject してしまう。その場合
  // Promise.all は claimsPromise の resolve/reject に関わらず reject し、
  // getClaims() の判定結果（未ログイン確定→redirect 等）に一切到達せず
  // 「getClaims threw」用の catch に落ちて誤って fail open する
  // （保護ルートで redirect すべきユーザーを通過させてしまう回帰）。
  // これを防ぐため、IIFE 全体にも防御的な .catch を重ねて「絶対に reject
  // しない」ことを保証する（コードレビュー指摘）。
  //
  // トークンは getSession()（design.md Decision 1 案）ではなく
  // readAccessTokenFromCookies()（3.1 で実装、getInitialStockItems.ts と
  // 共有）で読む。getSession() は内部の __loadSession が「期限切れ間近なら
  // リフレッシュする」ため（@supabase/auth-js の実装）、ネットワーク往復が
  // 発生し得て並列化の意図（ローカル読み取りのみ）を満たさず、getClaims()
  // 自身のリフレッシュとも競合しうる。cookie の直接読み取りは常にローカルで
  // 完結するため、この意図をより厳密に満たす。
  let itemsDurationMs: number | undefined;
  const stockItemsPromise: Promise<StockItem[] | undefined> = (async () => {
    if (request.nextUrl.pathname !== STOCK_ITEMS_PATH) return undefined;
    const activeGroupId = request.cookies.get(ACTIVE_GROUP_COOKIE_NAME)?.value;
    if (!activeGroupId) return undefined;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return undefined;
    const accessToken = await readAccessTokenFromCookies(
      supabaseUrl,
      (name) => request.cookies.get(name)?.value,
    );
    if (!accessToken) return undefined;

    const itemsStart = performance.now();
    try {
      return await fetchStockItems(accessToken, activeGroupId);
    } catch (err) {
      console.error("middleware: fetchStockItems threw", err);
      return undefined;
    } finally {
      itemsDurationMs = performance.now() - itemsStart;
    }
  })().catch((err) => {
    // 上記コメントの通り、ここに来るのは fetchStockItems() 自体の失敗以外
    // （IIFE 内の try/catch より前で投げられた例外）のみ。fetchStockItems()
    // 自体の失敗は既に内側の catch でログ済みなので、ここでの二重ログは
    // 発生しない。
    console.error(
      "middleware: stockItemsPromise threw outside its own error handling, failing open",
      err,
    );
    return undefined;
  });

  let isDefinitelyUnauthenticated = false;
  let claimsDurationMs: number | undefined;
  const claimsStart = performance.now();
  // getClaims() はセッションの有効期限が近ければ内部でリフレッシュしてから
  // 検証する（getSession() はリフレッシュはするが cookie 由来の値を無条件に
  // 信頼してしまうため、サーバー側での認証チェックには非推奨とされている）。
  // クライアントを生成しただけではリフレッシュは走らないため、この呼び出しが
  // 必須。
  const claimsPromise = supabase.auth.getClaims();
  try {
    const [{ data, error }, stockItems] = await Promise.all([
      claimsPromise,
      stockItemsPromise,
    ]);
    claimsDurationMs = performance.now() - claimsStart;
    if (data !== null) {
      // 認証済みと判定できた事実を Server Component（layout.tsx）へ転送する
      // （Issue #182）。middleware は request/response のライフサイクルの中で
      // 唯一 getClaims() を呼んで検証する場所であり、下流の Server Component
      // が同じ検証をもう一度行う（＝二重のネットワーク呼び出し）のを避ける
      // ため、ヘッダー経由で結果だけを渡す。
      //
      // 並行取得した在庫データも同じ理由でヘッダー経由で渡す
      // （tasks.md 4.2）。認証済みと確定した経路でのみ付与すること
      // （4.3: 未認証確定時は絶対に付与しない）。rebuildResponseFromRequest()
      // が request.headers の変更を下流に伝えるための再構築を行う。
      request.headers.set("x-pp-authenticated", "1");
      const serializedItems = serializeStockItemsForHeader(stockItems);
      if (serializedItems !== undefined) {
        request.headers.set("x-pp-initial-items", serializedItems);
      }
      rebuildResponseFromRequest();
    } else if (data === null && error === null) {
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
        // stock-items-ttfb-reduction Phase 2 (tasks.md 4.4, design.md
        // Decision 3): fail-open（判定不能）時は既存のredirect基準を変えない
        // が、並行取得したLambda結果が実際に成功していればforwardしてよい
        // （Goバックエンド自身のJWT検証が最終的な安全境界のため）。
        // stockItems はこの分岐に来た時点で Promise.all により解決済みで
        // 追加の待ちは発生しない。
        const serializedItems = serializeStockItemsForHeader(stockItems);
        if (serializedItems !== undefined) {
          request.headers.set("x-pp-initial-items", serializedItems);
          rebuildResponseFromRequest();
        }
      } else {
        // Retryable でも RefreshDiscarded でもない resolve エラー（例:
        // AuthInvalidJwtError）は、リトライしても解消しない明確な判定不能
        // ではなく「セッションが有効ではない」ケースとみなし、未ログイン
        // 確定として扱う。
        console.error(
          "middleware: getClaims resolved with a definitively invalid error, redirecting to /login",
          error,
        );
        isDefinitelyUnauthenticated = true;
      }
    }
  } catch (err) {
    claimsDurationMs = performance.now() - claimsStart;
    // リフレッシュ処理自体が例外を投げても fail open。未ログイン扱いにはせず、
    // 「セッション状態が確認できなかった」として素通りさせる（保護ルートで
    // あってもリフレッシュ失敗だけを理由に /login へは飛ばさない）。
    // 挙動は変えず observability のみ追加。
    console.error(
      "middleware: getClaims threw, failing open (session refresh not confirmed)",
      err,
    );
    // ここで Server-Timing に "items"（fetchStockItems の所要時間）区間を
    // 追加しないのは意図的。stockItemsPromise は上記の防御的 .catch により
    // 決して reject しないため、この catch に来る理由は getClaims() 自身が
    // throw したことのみ（並行フェッチ側の失敗ではない）。ただし
    // itemsDurationMs は並行実行中の stockItemsPromise 側で非同期に
    // セットされる値であり、claimsPromise が reject した時点で既に確定して
    // いるか（=セット済み）はタイミング次第で不定（レース）。この不確実な
    // 値を Server-Timing に出すと「items の所要時間として意味のある値」と
    // 誤解されるため、あえて出さない。将来「items が抜けているのはバグでは
    // ないか」と疑われた場合の手がかりとして、このコメントを残す。
    appendServerTiming(response, "claims", claimsDurationMs);
    return response;
  }

  if (claimsDurationMs !== undefined) {
    appendServerTiming(response, "claims", claimsDurationMs);
  }
  if (itemsDurationMs !== undefined) {
    appendServerTiming(response, "items", itemsDurationMs);
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
    if (claimsDurationMs !== undefined) {
      appendServerTiming(redirectResponse, "claims", claimsDurationMs);
    }
    if (itemsDurationMs !== undefined) {
      appendServerTiming(redirectResponse, "items", itemsDurationMs);
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
     * - api（/api/health, /api/warm/stock-items を含む。実 API は Go/Lambda
     *   側の別サービスであり、このアプリの /api/* は health check・warm-up
     *   用のルートのみ。認証不要。/api/warm/stock-items は自前の共有シークレット
     *   検証で保護される）
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icon-192\\.png|icon-512\\.png|icon\\.svg|sw\\.js|api/).*)",
  ],
};
