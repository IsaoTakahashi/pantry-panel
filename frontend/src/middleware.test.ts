import type { CookieOptions } from "@supabase/ssr";
import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
  type Session,
} from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStockItems } from "@/lib/api";
import { buildSessionCookies } from "@/lib/sessionCookie";

// @supabase/ssr の createServerClient を mock し、middleware が
// getClaims() / getSession() の結果 / エラーに応じてどう振る舞うかを確認する。
// /stock-items は getSession()、それ以外の保護ルートは getClaims() で判定する
// （stock-items-single-fetch design.md D1）。
// S-7（リフレッシュ成功時に Set-Cookie が付与される）/ S-8（リフレッシュ
// 失敗時も fail open で通過する）は下記の専用テストで検証する。
//
// createServerClient に渡される cookies オプション（getAll/setAll）も
// 捕捉する。S-7（リフレッシュ成功時に Set-Cookie が付与される）を検証
// するには、getClaimsMock / getSessionMock の実装内から setAll を呼び出して
// 「@supabase/ssr がリフレッシュ中に内部で cookie を書き込む」挙動を再現する
// 必要がある（route.test.ts の capturedCookieMethods パターンを踏襲）。
//
// createServerClient だけを差し替え、他のエクスポート（combineChunks 等）は
// 実物を通す。テストで cookie を組み立てる buildSessionCookies
// （lib/sessionCookie.ts）はこれらの実物の関数に依存しているため、
// 全体を差し替えると壊れる。
type CapturedCookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll?: (
    cookiesToSet: { name: string; value: string; options: CookieOptions }[],
    headers: Record<string, string>,
  ) => void;
};

let capturedCookieMethods: CapturedCookieMethods | null = null;
const getClaimsMock = vi.fn();
const getSessionMock = vi.fn();
vi.mock("@supabase/ssr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/ssr")>();
  return {
    ...actual,
    createServerClient: (
      _url: string,
      _key: string,
      options: { cookies: CapturedCookieMethods },
    ) => {
      capturedCookieMethods = options.cookies;
      return {
        auth: { getClaims: getClaimsMock, getSession: getSessionMock },
      };
    },
  };
});

// middleware は Go API を呼ばない（stock-items-single-fetch design.md D2）。
// 呼んでいないことを確認するため、また万一呼んだ場合に実際のネットワーク
// 呼び出し（localhost:8080）が発生しないようモックする。
vi.mock("@/lib/api", () => ({ fetchStockItems: vi.fn() }));

function makeRequest(
  path: string,
  cookies?: { name: string; value: string }[],
): NextRequest {
  const init = cookies?.length
    ? {
        headers: {
          cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
        },
      }
    : undefined;
  return new NextRequest(new URL(path, "https://example.com"), init);
}

// @supabase/ssr と同じ形式のセッション cookie（buildSessionCookies）を作る。
// /stock-items で「cookie がすべて揃っていても在庫を先読みしない」ことを
// 確認するために使う。
function authTokenCookies(
  accessToken: string,
): { name: string; value: string }[] {
  const session = { access_token: accessToken } as unknown as Session;
  return buildSessionCookies("https://example.supabase.co", session);
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaimsMock.mockReset();
    getSessionMock.mockReset();
    vi.mocked(fetchStockItems).mockReset();
    capturedCookieMethods = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("保護ルート・セッション無しのとき /login へリダイレクトする（正常系なのでログしない）", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/invite"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/login");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("保護ルート・有効なセッションありのとき通過させる（正常系なのでログしない）", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/invite"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("S-7: セッションリフレッシュ成功時、更新後の cookie が Set-Cookie として付与される", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaimsMock.mockImplementation(async () => {
      // @supabase/ssr が getClaims() 内部でリフレッシュを検知し、新しい
      // アクセストークンを cookie に書き込む挙動を再現する。
      capturedCookieMethods?.setAll?.(
        [
          {
            name: "sb-access-token",
            value: "refreshed-token-value",
            options: { path: "/" },
          },
        ],
        {
          "Cache-Control":
            "private, no-cache, no-store, must-revalidate, max-age=0",
        },
      );
      return { data: { claims: { sub: "user-1" } }, error: null };
    });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/invite"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("sb-access-token")?.value).toBe(
      "refreshed-token-value",
    );
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("リフレッシュが例外を投げても fail open で通過させる（保護ルートでもリダイレクトしない）。console.error でログされる", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = new Error("network error");
    getClaimsMock.mockRejectedValue(thrown);
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/invite"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // fail open は黙って行わず、observability のため必ずログを残す
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("threw"),
      thrown,
    );
    errorSpy.mockRestore();
  });

  // getClaims() は一時的な障害（AuthRetryableFetchError 等）でも reject せず、
  // `{ data: null, error }` を resolve で返す（auth-js の実装を確認済み）。
  // data === null だけを見て redirect すると、この resolve パスが未ログイン
  // 確定と誤判定され fail open が壊れる。これが実際の discriminator。
  //
  // モックは実際の AuthRetryableFetchError インスタンスを使う必要がある。
  // isAuthRetryableFetchError() は isAuthError()（`__isAuthError` プロパティの
  // ダックタイピング。AuthError のコンストラクタが実際に設定する）を経由する
  // ため、`{ name: "AuthRetryableFetchError" }` のようなプレーンオブジェクトは
  // 型ガードを満たさず、このテストは（変更後の実装に対して）誤って
  // 「定義不能 → fail open しない」分岐を通ってしまう。
  it("getClaims が AuthRetryableFetchError 付きで resolve しても fail open で通過させる。console.error でログされる", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimsError = new AuthRetryableFetchError("fetch failed", 0);
    getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/invite"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // fail open は黙って行わず、observability のため必ずログを残す
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("resolved with an error"),
      claimsError,
    );
    errorSpy.mockRestore();
  });

  // S-2: AuthRefreshDiscardedError は「サーバーはリフレッシュに成功したが、
  // ローカルのセッション状態が途中で変わった（例: 別タブでの同時 signOut）
  // ため保存を見送った」ことを示す benign な競合状態であり、トークン自体が
  // 無効なわけではない。fail open 側に分類され、redirect しない。
  it("getClaims が AuthRefreshDiscardedError 付きで resolve しても fail open で通過させる", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimsError = new AuthRefreshDiscardedError();
    getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/invite"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // fail open は黙って行わず、observability のため必ずログを残す
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("resolved with an error"),
      claimsError,
    );
    errorSpy.mockRestore();
  });

  // S-3: いずれの型ガード（Retryable / RefreshDiscarded）も満たさない resolve
  // エラー（例: AuthInvalidJwtError）は、本 change の核となる discriminator。
  // 旧実装（error !== null なら常に fail open）ではこのケースも通過して
  // しまっていたが、新実装では「判定不能」ではなく「未ログイン確定」として
  // 扱われ、保護ルートでは /login へ redirect する。
  it("S-3: getClaims が AuthInvalidJwtError 付きで resolve した場合、保護ルートでは /login へリダイレクトする", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimsError = new AuthInvalidJwtError("Token signature is invalid");
    getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/invite"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/login");
    errorSpy.mockRestore();
  });

  // S-3 非保護ルート版（回帰チェック）: isDefinitelyUnauthenticated が true に
  // なっても、matchesPath(..., PROTECTED_PATHS) が false なら redirect しない
  // という既存の AND ゲートは本 change で変更していない。
  it("S-3非保護ルート: getClaims が AuthInvalidJwtError 付きで resolve しても非保護ルートではリダイレクトしない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimsError = new AuthInvalidJwtError("Token signature is invalid");
    getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/health"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    errorSpy.mockRestore();
  });

  it("/login は除外ルートなので getClaims を呼ばず通過させる", async () => {
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/login"));

    expect(res.status).toBe(200);
    expect(getClaimsMock).not.toHaveBeenCalled();
  });

  it("/auth/clear-session は除外ルートなので getClaims を呼ばず通過させる", async () => {
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/auth/clear-session"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(getClaimsMock).not.toHaveBeenCalled();
  });

  it("非保護ルート・セッション無しでもリダイレクトしない", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/health"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  // S-9 (Issue #260): isDefinitelyUnauthenticated になる2経路
  // (a) data===null && error===null と (b) AuthInvalidJwtError resolve の
  // どちらでも、redirectResponse は request が持っていた sb-*-auth-token
  // cookie（チャンク分割されたものを含む）を失効させなければならない。
  // ブラウザ側の createBrowserClient（supabaseClient.ts）は同じ cookie
  // ストアを読むため、cookie が残ると /login → /stock-items の
  // リダイレクトループになる（Issue #260）。
  //
  // 事前検証（実装前の RED 確認）: この単体テストは createServerClient
  // 自体を丸ごとモックしているため、@supabase/ssr が実環境の (a) で内部の
  // setAll() を呼んで cookie を消しているかどうかはこのテストからは
  // 観測できない（テストの getClaimsMock は setAll を呼ばない）。その結果、
  // 修正前の実装では (a)(b) の両方が red になった。つまり
  // middleware.ts 自身は経路によらず cookie を明示的にクリアしていない
  // ため、修正は経路を問わず isDefinitelyUnauthenticated の redirect
  // 分岐全体に対して行う。
  describe("S-9: redirect 時に sb-*-auth-token cookie を失効させる", () => {
    it("(a) セッション無し(data/error 共に null) で redirect する際、単一の auth-token cookie を失効させる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({ data: null, error: null });
      const { middleware } = await import("./middleware");

      const res = await middleware(
        makeRequest("/invite", [
          { name: "sb-fakeref-auth-token", value: "stale-value" },
        ]),
      );

      expect(res.status).toBe(307);
      const cleared = res.cookies.get("sb-fakeref-auth-token");
      expect(cleared?.value).toBe("");
      errorSpy.mockRestore();
    });

    it("(a) セッション無しで redirect する際、チャンク分割された auth-token cookie を両方失効させる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({ data: null, error: null });
      const { middleware } = await import("./middleware");

      const res = await middleware(
        makeRequest("/invite", [
          { name: "sb-fakeref-auth-token.0", value: "chunk0" },
          { name: "sb-fakeref-auth-token.1", value: "chunk1" },
        ]),
      );

      expect(res.status).toBe(307);
      expect(res.cookies.get("sb-fakeref-auth-token.0")?.value).toBe("");
      expect(res.cookies.get("sb-fakeref-auth-token.1")?.value).toBe("");
      errorSpy.mockRestore();
    });

    it("(b) AuthInvalidJwtError resolve で redirect する際、単一の auth-token cookie を失効させる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const claimsError = new AuthInvalidJwtError("Token signature is invalid");
      getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
      const { middleware } = await import("./middleware");

      const res = await middleware(
        makeRequest("/invite", [
          { name: "sb-fakeref-auth-token", value: "stale-value" },
        ]),
      );

      expect(res.status).toBe(307);
      const cleared = res.cookies.get("sb-fakeref-auth-token");
      expect(cleared?.value).toBe("");
      errorSpy.mockRestore();
    });

    it("(b) AuthInvalidJwtError resolve で redirect する際、チャンク分割された auth-token cookie を両方失効させる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const claimsError = new AuthInvalidJwtError("Token signature is invalid");
      getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
      const { middleware } = await import("./middleware");

      const res = await middleware(
        makeRequest("/invite", [
          { name: "sb-fakeref-auth-token.0", value: "chunk0" },
          { name: "sb-fakeref-auth-token.1", value: "chunk1" },
        ]),
      );

      expect(res.status).toBe(307);
      expect(res.cookies.get("sb-fakeref-auth-token.0")?.value).toBe("");
      expect(res.cookies.get("sb-fakeref-auth-token.1")?.value).toBe("");
      errorSpy.mockRestore();
    });
  });

  // S-10 (Issue #182): 認証済みと判定できたリクエストには、layout.tsx が
  // AuthProvider の初期状態を組み立てるための x-pp-authenticated ヘッダーを
  // 付与する。Server Component は middleware の判定結果を直接読めないため、
  // request.headers 経由で明示的に転送する必要がある。
  it("S-10: 認証済みのとき request.headers に x-pp-authenticated: 1 がセットされる", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    const { middleware } = await import("./middleware");

    const req = makeRequest("/invite");
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBe("1");
  });

  it("S-10: 未ログイン確定（data===null, error===null）のとき x-pp-authenticated を付与しない", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const req = makeRequest("/invite");
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBeNull();
  });

  it("S-10: /login は除外ルートなので x-pp-authenticated は付与されない（getClaims自体呼ばれない）", async () => {
    const { middleware } = await import("./middleware");

    const req = makeRequest("/login");
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBeNull();
    expect(getClaimsMock).not.toHaveBeenCalled();
  });

  // S-10 なりすまし防止: x-pp-authenticated は「middleware が getClaims() で
  // 検証済み」という事実の証跡として layout.tsx に信頼されるため、クライアント
  // が最初からこのヘッダーを付けて送ってきても、middleware 自身の判定結果でしか
  // 上書きされてはならない（未認証と判定されたら必ず除去される）。
  it("S-10: クライアントが x-pp-authenticated を偽装して送っても、未認証判定なら除去される", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const req = new NextRequest(new URL("/invite", "https://example.com"), {
      headers: { "x-pp-authenticated": "1" },
    });
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBeNull();
  });

  it("S-10: 除外ルートでもクライアントが偽装した x-pp-authenticated は除去される", async () => {
    const { middleware } = await import("./middleware");

    const req = new NextRequest(new URL("/login", "https://example.com"), {
      headers: { "x-pp-authenticated": "1" },
    });
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBeNull();
    expect(getClaimsMock).not.toHaveBeenCalled();
  });

  // Phase 0 (stock-items-ttfb-reduction tasks.md 1.1): cold時のTTFB内訳を
  // 本番のServer-Timingデータから判断できるようにするため、getClaims()の
  // 実行時間を計測しレスポンスヘッダーに載せる。挙動（redirect判定・
  // fail-open/closed）自体は変更しない。
  describe("Server-Timing: getClaims() の実行時間を計測する", () => {
    it("認証済みで通過するとき、Server-Timing ヘッダーに claims の所要時間が含まれる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      const { middleware } = await import("./middleware");

      const res = await middleware(makeRequest("/invite"));

      expect(res.status).toBe(200);
      expect(res.headers.get("Server-Timing")).toMatch(
        /claims;dur=\d+(\.\d+)?/,
      );
      errorSpy.mockRestore();
    });

    it("未ログイン確定で /login へリダイレクトするときも、Server-Timing ヘッダーに claims の所要時間が含まれる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({ data: null, error: null });
      const { middleware } = await import("./middleware");

      const res = await middleware(makeRequest("/invite"));

      expect(res.status).toBe(307);
      expect(res.headers.get("Server-Timing")).toMatch(
        /claims;dur=\d+(\.\d+)?/,
      );
      errorSpy.mockRestore();
    });

    it("getClaims が例外を投げて fail open するときも、Server-Timing ヘッダーに claims の所要時間が含まれる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockRejectedValue(new Error("network error"));
      const { middleware } = await import("./middleware");

      const res = await middleware(makeRequest("/invite"));

      expect(res.status).toBe(200);
      expect(res.headers.get("Server-Timing")).toMatch(
        /claims;dur=\d+(\.\d+)?/,
      );
      errorSpy.mockRestore();
    });
  });
  // stock-items-single-fetch (tasks.md 4.1〜4.3, e2e-design.md S-1〜S-4・
  // S-11): /stock-items だけは getClaims()（JWKS 取得を伴う署名検証）ではなく
  // getSession()（期限内なら cookie を読むだけ）でセッションを判定する。
  // 認証の最終的な境界は Go API の JWT 検証であり、middleware は在庫の先読み
  // もしない。「通信しない」こと自体はモック境界の外（e2e-design.md 前提）
  // なので、ここでは getClaims / fetchStockItems のモックが呼ばれないことまでを
  // 確認する。
  describe("/stock-items: getSession() による判定（getClaims・在庫先読みなし）", () => {
    const ACTIVE_GROUP_COOKIE = "pantry-panel-active-group";

    function validSession(): Session {
      return {
        access_token: "tok",
        refresh_token: "refresh",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: { id: "user-1" },
      } as unknown as Session;
    }

    function stockItemsRequest(
      extraCookies: { name: string; value: string }[] = [],
    ): NextRequest {
      return makeRequest("/stock-items", [
        ...authTokenCookies("tok"),
        { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
        ...extraCookies,
      ]);
    }

    it("S-1: 期限内のセッションなら getSession だけで通過し、x-pp-authenticated: 1 を付ける（getClaims は呼ばない）", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getSessionMock.mockResolvedValue({
        data: { session: validSession() },
        error: null,
      });
      const { middleware } = await import("./middleware");

      const req = stockItemsRequest();
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(getSessionMock).toHaveBeenCalledTimes(1);
      expect(getClaimsMock).not.toHaveBeenCalled();
      expect(req.headers.get("x-pp-authenticated")).toBe("1");
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("S-1/S-4: cookie がすべて揃っていても middleware は fetchStockItems を呼ばず、x-pp-initial-items を付けない", async () => {
      getSessionMock.mockResolvedValue({
        data: { session: validSession() },
        error: null,
      });
      const { middleware } = await import("./middleware");

      const req = stockItemsRequest();
      const res = await middleware(req);

      expect(fetchStockItems).not.toHaveBeenCalled();
      expect(req.headers.get("x-pp-initial-items")).toBeNull();
      expect(res.headers.get("x-pp-initial-items")).toBeNull();
    });

    it("S-2: getSession 内でセッションが更新されたとき、新しい cookie と Cache-Control が response に載り、x-pp-authenticated も付く", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getSessionMock.mockImplementation(async () => {
        capturedCookieMethods?.setAll?.(
          [
            {
              name: "sb-access-token",
              value: "refreshed-token-value",
              options: { path: "/" },
            },
          ],
          {
            "Cache-Control":
              "private, no-cache, no-store, must-revalidate, max-age=0",
          },
        );
        return { data: { session: validSession() }, error: null };
      });
      const { middleware } = await import("./middleware");

      const req = stockItemsRequest();
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.cookies.get("sb-access-token")?.value).toBe(
        "refreshed-token-value",
      );
      expect(res.headers.get("Cache-Control")).toContain("no-store");
      expect(req.headers.get("x-pp-authenticated")).toBe("1");
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    describe("S-3: getSession の結果の分類", () => {
      it("(a) AuthRetryableFetchError で resolve したら fail open（redirect せず、x-pp-authenticated も付けない）。console.error でログされる", async () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const sessionError = new AuthRetryableFetchError("fetch failed", 0);
        getSessionMock.mockResolvedValue({
          data: { session: null },
          error: sessionError,
        });
        const { middleware } = await import("./middleware");

        const req = stockItemsRequest();
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
        expect(req.headers.get("x-pp-authenticated")).toBeNull();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("getSession resolved with an error"),
          sessionError,
        );
        errorSpy.mockRestore();
      });

      it("(b) AuthRefreshDiscardedError で resolve したら fail open。console.error でログされる", async () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const sessionError = new AuthRefreshDiscardedError();
        getSessionMock.mockResolvedValue({
          data: { session: null },
          error: sessionError,
        });
        const { middleware } = await import("./middleware");

        const req = stockItemsRequest();
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
        expect(req.headers.get("x-pp-authenticated")).toBeNull();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("getSession resolved with an error"),
          sessionError,
        );
        errorSpy.mockRestore();
      });

      it("(c) 例外を投げたら fail open。console.error でログされる", async () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const thrown = new Error("network error");
        getSessionMock.mockRejectedValue(thrown);
        const { middleware } = await import("./middleware");

        const req = stockItemsRequest();
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
        expect(req.headers.get("x-pp-authenticated")).toBeNull();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("getSession threw"),
          thrown,
        );
        errorSpy.mockRestore();
      });

      // (d) が fail open の対象を広げすぎていないかの discriminator。
      // refresh token が無効などの確定的なエラーは、未ログイン確定として
      // cookie を失効させて /login へ送る。
      it("(d) それ以外のエラー（AuthApiError 等）で resolve したら、単一の auth-token cookie を失効させて /login へリダイレクトする", async () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        getSessionMock.mockResolvedValue({
          data: { session: null },
          error: new AuthApiError(
            "Invalid Refresh Token",
            400,
            "refresh_token_not_found",
          ),
        });
        const { middleware } = await import("./middleware");

        const req = makeRequest("/stock-items", [
          { name: "sb-fakeref-auth-token", value: "stale-value" },
        ]);
        const res = await middleware(req);

        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("https://example.com/login");
        expect(res.cookies.get("sb-fakeref-auth-token")?.value).toBe("");
        expect(res.headers.get("set-cookie")).toMatch(
          /sb-fakeref-auth-token=;.*Max-Age=0/i,
        );
        expect(req.headers.get("x-pp-authenticated")).toBeNull();
        errorSpy.mockRestore();
      });

      it("(d) それ以外のエラーで resolve したら、チャンク分割された auth-token cookie を両方失効させる", async () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        getSessionMock.mockResolvedValue({
          data: { session: null },
          error: new AuthApiError(
            "Invalid Refresh Token",
            400,
            "refresh_token_not_found",
          ),
        });
        const { middleware } = await import("./middleware");

        const res = await middleware(
          makeRequest("/stock-items", [
            { name: "sb-fakeref-auth-token.0", value: "chunk0" },
            { name: "sb-fakeref-auth-token.1", value: "chunk1" },
          ]),
        );

        expect(res.status).toBe(307);
        expect(res.cookies.get("sb-fakeref-auth-token.0")?.value).toBe("");
        expect(res.cookies.get("sb-fakeref-auth-token.1")?.value).toBe("");
        errorSpy.mockRestore();
      });

      it("(e) session === null かつエラーなしなら、auth-token cookie を失効させて /login へリダイレクトする（正常系なのでログしない）", async () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        getSessionMock.mockResolvedValue({
          data: { session: null },
          error: null,
        });
        const { middleware } = await import("./middleware");

        const res = await middleware(
          makeRequest("/stock-items", [
            { name: "sb-fakeref-auth-token.0", value: "chunk0" },
            { name: "sb-fakeref-auth-token.1", value: "chunk1" },
          ]),
        );

        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("https://example.com/login");
        expect(res.cookies.get("sb-fakeref-auth-token.0")?.value).toBe("");
        expect(res.cookies.get("sb-fakeref-auth-token.1")?.value).toBe("");
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
      });

      it("(e) クライアントが偽装した x-pp-authenticated は、セッションなしのとき伝わらない", async () => {
        getSessionMock.mockResolvedValue({
          data: { session: null },
          error: null,
        });
        const { middleware } = await import("./middleware");

        const req = new NextRequest(
          new URL("/stock-items", "https://example.com"),
          { headers: { "x-pp-authenticated": "1" } },
        );
        await middleware(req);

        expect(req.headers.get("x-pp-authenticated")).toBeNull();
      });
    });

    describe("S-11: Server-Timing は claims 区間（getSession の所要時間）だけで、items 区間は無い", () => {
      it("通過するとき", async () => {
        getSessionMock.mockResolvedValue({
          data: { session: validSession() },
          error: null,
        });
        const { middleware } = await import("./middleware");

        const res = await middleware(stockItemsRequest());

        const timing = res.headers.get("Server-Timing");
        expect(timing).toMatch(/claims;dur=\d+(\.\d+)?/);
        expect(timing).not.toContain("items");
      });

      it("/login へリダイレクトするとき", async () => {
        getSessionMock.mockResolvedValue({
          data: { session: null },
          error: null,
        });
        const { middleware } = await import("./middleware");

        const res = await middleware(stockItemsRequest());

        expect(res.status).toBe(307);
        const timing = res.headers.get("Server-Timing");
        expect(timing).toMatch(/claims;dur=\d+(\.\d+)?/);
        expect(timing).not.toContain("items");
      });

      it("例外で fail open するとき", async () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        getSessionMock.mockRejectedValue(new Error("network error"));
        const { middleware } = await import("./middleware");

        const res = await middleware(stockItemsRequest());

        expect(res.status).toBe(200);
        const timing = res.headers.get("Server-Timing");
        expect(timing).toMatch(/claims;dur=\d+(\.\d+)?/);
        expect(timing).not.toContain("items");
        errorSpy.mockRestore();
      });
    });
  });

  // S-9 (stock-items-single-fetch): /stock-items 以外の保護ルートは従来どおり
  // getClaims() で判定し、getSession() は呼ばない。上の getClaims 系テストは
  // この変更に合わせて送り先を /invite に付け替えてある。
  describe("S-9: /stock-items 以外の保護ルートは getClaims() で判定する", () => {
    it.each(["/", "/invite", "/no-group"])(
      "%s では getClaims を呼び、getSession は呼ばない",
      async (path) => {
        getClaimsMock.mockResolvedValue({
          data: { claims: { sub: "user-1" } },
          error: null,
        });
        const { middleware } = await import("./middleware");

        const req = makeRequest(path);
        const res = await middleware(req);

        expect(res.status).toBe(200);
        expect(getClaimsMock).toHaveBeenCalledTimes(1);
        expect(getSessionMock).not.toHaveBeenCalled();
        expect(req.headers.get("x-pp-authenticated")).toBe("1");
      },
    );

    it("/stock-items/<子パス> は /stock-items と同一ではないので getClaims で判定する", async () => {
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      const { middleware } = await import("./middleware");

      await middleware(makeRequest("/stock-items/abc"));

      expect(getClaimsMock).toHaveBeenCalledTimes(1);
      expect(getSessionMock).not.toHaveBeenCalled();
    });
  });
});
