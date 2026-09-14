import { type CookieOptions, stringFromBase64URL } from "@supabase/ssr";
import {
  AuthInvalidJwtError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
  type Session,
} from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStockItems } from "@/lib/api";
import { buildSessionCookies } from "@/lib/sessionCookie";
import type { StockItem } from "@/types/stockItem";

// @supabase/ssr の createServerClient を mock し、middleware が
// getClaims() の結果 / エラーに応じてどう振る舞うかを確認する。
// S-7（リフレッシュ成功時に Set-Cookie が付与される）/ S-8（リフレッシュ
// 失敗時も fail open で通過する）は下記の専用テストで検証する。
//
// createServerClient に渡される cookies オプション（getAll/setAll）も
// 捕捉する。S-7（リフレッシュ成功時に Set-Cookie が付与される）を検証
// するには、getClaimsMock の実装内から setAll を呼び出して「@supabase/ssr
// がリフレッシュ中に内部で cookie を書き込む」挙動を再現する必要がある
// （route.test.ts の capturedCookieMethods パターンを踏襲）。
//
// createServerClient だけを差し替え、他のエクスポート（combineChunks 等）は
// 実物を通す。middleware.ts が読み取りに使う readAccessTokenFromCookies
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
        auth: { getClaims: getClaimsMock },
      };
    },
  };
});

// stock-items-ttfb-reduction Phase 2 (tasks.md 4.1): middleware は Go Lambda
// への在庫データフェッチをここで発射するようになるため、実際のネットワーク
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

// stock-items-ttfb-reduction Phase 2 (tasks.md 4.1): middleware は
// readAccessTokenFromCookies（getInitialStockItems.ts と同じヘルパー、3.1で
// 実装済み）で access_token を cookie から直接読み取る。buildSessionCookies
// で実際に @supabase/ssr と同じ形式の cookie を作り、ラウンドトリップさせる。
function authTokenCookies(
  accessToken: string,
): { name: string; value: string }[] {
  const session = { access_token: accessToken } as unknown as Session;
  return buildSessionCookies("https://example.supabase.co", session);
}

function makeStockItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: "1",
    name: "商品A",
    category: "調味料",
    imageUrl: null,
    sourceUrl: null,
    wantToBuy: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    sortedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// 6KiB の閾値（暫定、design.md Open Questions）を確実に超えさせるための
// 大量アイテム。個々のフィールドサイズから、6KiB を超えるには十分すぎる件数
// にしてある（境界値そのものの厳密な検証ではなく「超える/超えない」の
// 二値の確認が目的）。
function makeManyStockItems(count: number): StockItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeStockItem({ id: `id-${i}`, name: `商品-${i}-${"x".repeat(50)}` }),
  );
}

function decodeInitialItemsHeader(headerValue: string): unknown {
  return JSON.parse(stringFromBase64URL(headerValue));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaimsMock.mockReset();
    vi.mocked(fetchStockItems).mockReset();
    capturedCookieMethods = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("保護ルート・セッション無しのとき /login へリダイレクトする（正常系なのでログしない）", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

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

    const res = await middleware(makeRequest("/stock-items"));

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

    const res = await middleware(makeRequest("/stock-items"));

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

    const res = await middleware(makeRequest("/stock-items"));

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

    const res = await middleware(makeRequest("/stock-items"));

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

    const res = await middleware(makeRequest("/stock-items"));

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

    const res = await middleware(makeRequest("/stock-items"));

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
        makeRequest("/stock-items", [
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

    it("(b) AuthInvalidJwtError resolve で redirect する際、単一の auth-token cookie を失効させる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const claimsError = new AuthInvalidJwtError("Token signature is invalid");
      getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
      const { middleware } = await import("./middleware");

      const res = await middleware(
        makeRequest("/stock-items", [
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

    const req = makeRequest("/stock-items");
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBe("1");
  });

  it("S-10: 未ログイン確定（data===null, error===null）のとき x-pp-authenticated を付与しない", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const req = makeRequest("/stock-items");
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

    const req = new NextRequest(
      new URL("/stock-items", "https://example.com"),
      {
        headers: { "x-pp-authenticated": "1" },
      },
    );
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

      const res = await middleware(makeRequest("/stock-items"));

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

      const res = await middleware(makeRequest("/stock-items"));

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

      const res = await middleware(makeRequest("/stock-items"));

      expect(res.status).toBe(200);
      expect(res.headers.get("Server-Timing")).toMatch(
        /claims;dur=\d+(\.\d+)?/,
      );
      errorSpy.mockRestore();
    });
  });

  // stock-items-ttfb-reduction Phase 2 (tasks.md 4.1): getClaims()（認証検証）
  // と fetchStockItems()（Go Lambda への在庫データフェッチ）を Promise.all で
  // 並列発射する。ヘッダー経由でpageに伝達するロジック（4.2〜4.4）は別テストで
  // 検証する。ここでは「いつ fetchStockItems が呼ばれる/呼ばれないか」の
  // ゲーティング条件と、区間計測（Server-Timing）を確認する。
  describe("Phase 2: middleware内でのstock itemsフェッチの並列発射", () => {
    const ACTIVE_GROUP_COOKIE = "pantry-panel-active-group";

    it("/stock-items へのアクセスで access_token・activeGroupId cookie が揃っているとき fetchStockItems が呼ばれる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      vi.mocked(fetchStockItems).mockResolvedValue([]);
      const { middleware } = await import("./middleware");

      await middleware(
        makeRequest("/stock-items", [
          ...authTokenCookies("tok"),
          { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
        ]),
      );

      expect(fetchStockItems).toHaveBeenCalledWith("tok", "group-1");
      errorSpy.mockRestore();
    });

    it("activeGroupId cookie が無いとき fetchStockItems は呼ばれない", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      const { middleware } = await import("./middleware");

      await middleware(makeRequest("/stock-items", authTokenCookies("tok")));

      expect(fetchStockItems).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("access_token cookie が無いとき fetchStockItems は呼ばれない", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({ data: null, error: null });
      const { middleware } = await import("./middleware");

      await middleware(
        makeRequest("/stock-items", [
          { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
        ]),
      );

      expect(fetchStockItems).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("/stock-items 以外のパスでは、cookieが揃っていても fetchStockItems は呼ばれない", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      const { middleware } = await import("./middleware");

      await middleware(
        makeRequest("/no-group", [
          ...authTokenCookies("tok"),
          { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
        ]),
      );

      expect(fetchStockItems).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("認証済みで通過するとき、Server-Timing ヘッダーに items の所要時間が含まれる", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      vi.mocked(fetchStockItems).mockResolvedValue([]);
      const { middleware } = await import("./middleware");

      const res = await middleware(
        makeRequest("/stock-items", [
          ...authTokenCookies("tok"),
          { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
        ]),
      );

      expect(res.headers.get("Server-Timing")).toMatch(/items;dur=\d+(\.\d+)?/);
      errorSpy.mockRestore();
    });
  });

  // stock-items-ttfb-reduction Phase 2 (tasks.md 4.2): 認証済みと判定できた
  // 場合、並行取得した在庫データを x-pp-initial-items ヘッダー（base64url
  // エンコード。日本語の商品名等がヘッダー値として壊れず往復することを
  // 確認する）として request に付与する。サイズ閾値（暫定6KiB）を超える
  // 場合は付与しない。
  describe("Phase 2: x-pp-initial-items ヘッダーへのシリアライズ・付与", () => {
    const ACTIVE_GROUP_COOKIE = "pantry-panel-active-group";

    function makeAuthenticatedRequest(items: unknown): {
      req: NextRequest;
      run: () => Promise<import("next/server").NextResponse>;
    } {
      const req = makeRequest("/stock-items", [
        ...authTokenCookies("tok"),
        { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
      ]);
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      vi.mocked(fetchStockItems).mockResolvedValue(items as StockItem[]);
      return {
        req,
        run: async () => {
          const { middleware } = await import("./middleware");
          return middleware(req);
        },
      };
    }

    it("フェッチ結果が x-pp-initial-items ヘッダーとして付与され、日本語を含んでも正しく往復する", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const items = [makeStockItem()];
      const { req, run } = makeAuthenticatedRequest(items);

      await run();

      const headerValue = req.headers.get("x-pp-initial-items");
      expect(headerValue).not.toBeNull();
      expect(decodeInitialItemsHeader(headerValue as string)).toEqual(items);
      errorSpy.mockRestore();
    });

    it("サイズが閾値(6KiB)を超えるとき x-pp-initial-items ヘッダーは付与されない", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const items = makeManyStockItems(100);
      // 前提確認: このフィクスチャが本当に閾値を超えていることを検証する
      // （閾値未満のフィクスチャに変わってしまうと、このテストは意図せず
      // 常に green になり検知力を失う）。
      expect(JSON.stringify(items).length).toBeGreaterThan(6 * 1024);
      const { req, run } = makeAuthenticatedRequest(items);

      await run();

      expect(req.headers.get("x-pp-initial-items")).toBeNull();
      errorSpy.mockRestore();
    });

    it("fetchStockItems が失敗したとき x-pp-initial-items ヘッダーは付与されない", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = makeRequest("/stock-items", [
        ...authTokenCookies("tok"),
        { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
      ]);
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));
      const { middleware } = await import("./middleware");

      await middleware(req);

      expect(req.headers.get("x-pp-initial-items")).toBeNull();
      errorSpy.mockRestore();
    });

    // stock-items-ttfb-reduction Phase 2 (tasks.md 4.3): spec.md の MUST NOT
    // 要件（未認証確定時にデータが応答に含まれない）の直接的な確認。並行
    // フェッチが実際に成功していても（＝ stockItems は取得できていても）、
    // getClaims() が未認証確定と判定すれば x-pp-initial-items は絶対に
    // 付与されない。isDefinitelyUnauthenticated になる2経路（(a) data/error
    // 共に null, (b) AuthInvalidJwtError resolve）の両方を確認する
    // （S-9 と同じ2経路）。
    it("(a) 未ログイン確定(data/error共にnull)のとき、並行フェッチが成功していても x-pp-initial-items は付与されない", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = makeRequest("/stock-items", [
        ...authTokenCookies("tok"),
        { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
      ]);
      getClaimsMock.mockResolvedValue({ data: null, error: null });
      vi.mocked(fetchStockItems).mockResolvedValue([makeStockItem()]);
      const { middleware } = await import("./middleware");

      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(req.headers.get("x-pp-initial-items")).toBeNull();
      expect(res.headers.get("x-pp-initial-items")).toBeNull();
      errorSpy.mockRestore();
    });

    it("(b) AuthInvalidJwtError resolve で未ログイン確定のとき、並行フェッチが成功していても x-pp-initial-items は付与されない", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = makeRequest("/stock-items", [
        ...authTokenCookies("tok"),
        { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
      ]);
      getClaimsMock.mockResolvedValue({
        data: null,
        error: new AuthInvalidJwtError("Token signature is invalid"),
      });
      vi.mocked(fetchStockItems).mockResolvedValue([makeStockItem()]);
      const { middleware } = await import("./middleware");

      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(req.headers.get("x-pp-initial-items")).toBeNull();
      expect(res.headers.get("x-pp-initial-items")).toBeNull();
      errorSpy.mockRestore();
    });

    // stock-items-ttfb-reduction Phase 2 (tasks.md 4.4): fail-open（判定不能）
    // 時は既存のredirect基準を変えない。design.md Decision 3 は、並行取得した
    // Lambda結果が実際に成功していれば forward してよいとしている
    // （Goバックエンド自身のJWT検証が最終的な安全境界のため）。
    it("AuthRetryableFetchError でresolveしてfail openする場合、並行フェッチが成功していれば x-pp-initial-items が付与される", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = makeRequest("/stock-items", [
        ...authTokenCookies("tok"),
        { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
      ]);
      getClaimsMock.mockResolvedValue({
        data: null,
        error: new AuthRetryableFetchError("fetch failed", 0),
      });
      const items = [makeStockItem()];
      vi.mocked(fetchStockItems).mockResolvedValue(items);
      const { middleware } = await import("./middleware");

      const res = await middleware(req);

      expect(res.status).toBe(200);
      const headerValue = req.headers.get("x-pp-initial-items");
      expect(headerValue).not.toBeNull();
      expect(decodeInitialItemsHeader(headerValue as string)).toEqual(items);
      errorSpy.mockRestore();
    });

    it("AuthRefreshDiscardedError でresolveしてfail openする場合も、並行フェッチが成功していれば x-pp-initial-items が付与される", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = makeRequest("/stock-items", [
        ...authTokenCookies("tok"),
        { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
      ]);
      getClaimsMock.mockResolvedValue({
        data: null,
        error: new AuthRefreshDiscardedError(),
      });
      const items = [makeStockItem()];
      vi.mocked(fetchStockItems).mockResolvedValue(items);
      const { middleware } = await import("./middleware");

      const res = await middleware(req);

      expect(res.status).toBe(200);
      const headerValue = req.headers.get("x-pp-initial-items");
      expect(headerValue).not.toBeNull();
      expect(decodeInitialItemsHeader(headerValue as string)).toEqual(items);
      errorSpy.mockRestore();
    });

    // getClaims() が例外を投げるケースは、並行フェッチの結果を待たずに即座に
    // fail-open で返す設計判断（advisor指摘: fetchStockItemsのタイムアウトは
    // 10秒あり、ここで待つとfail-openのはずの応答が最大10秒ブロックされうる）。
    // そのため、たとえ並行フェッチが実際には成功する見込みだったとしても、
    // このパスでは x-pp-initial-items は付与されない
    // （getInitialStockItems.ts のフォールバック取得に委ねる、5.2で実装）。
    it("getClaims が例外を投げてfail openする場合、x-pp-initial-items は付与されない（並行フェッチの結果を待たない）", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = makeRequest("/stock-items", [
        ...authTokenCookies("tok"),
        { name: ACTIVE_GROUP_COOKIE, value: "group-1" },
      ]);
      getClaimsMock.mockRejectedValue(new Error("network error"));
      vi.mocked(fetchStockItems).mockResolvedValue([makeStockItem()]);
      const { middleware } = await import("./middleware");

      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(req.headers.get("x-pp-initial-items")).toBeNull();
      errorSpy.mockRestore();
    });

    it("クライアントが x-pp-initial-items を偽装して送っても、middleware が取得していないなら除去される", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getClaimsMock.mockResolvedValue({ data: null, error: null });
      const req = new NextRequest(new URL("/health", "https://example.com"), {
        headers: { "x-pp-initial-items": "forged-value" },
      });
      const { middleware } = await import("./middleware");

      await middleware(req);

      expect(req.headers.get("x-pp-initial-items")).toBeNull();
      errorSpy.mockRestore();
    });

    it("activeGroupId cookie が無く在庫データを取得していないとき、認証済みでも x-pp-initial-items ヘッダーは付与されない", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = makeRequest("/stock-items", authTokenCookies("tok"));
      getClaimsMock.mockResolvedValue({
        data: { claims: { sub: "user-1" } },
        error: null,
      });
      const { middleware } = await import("./middleware");

      await middleware(req);

      expect(req.headers.get("x-pp-initial-items")).toBeNull();
      errorSpy.mockRestore();
    });
  });
});
