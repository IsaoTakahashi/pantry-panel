import type { CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// @supabase/ssr の createServerClient を mock し、Route Handler が渡す
// cookies アクセサ（getAll/setAll）を捕捉する。exchangeCodeForSession の
// 実装側で setAll を呼び出すことで、「本当に cookie が書き込まれるか」を
// 実装詳細（supabaseServerClient.ts）に立ち入らず検証できる。
type CapturedCookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll?: (
    cookiesToSet: { name: string; value: string; options: CookieOptions }[],
    headers: Record<string, string>,
  ) => void;
};

let capturedCookieMethods: CapturedCookieMethods | null = null;
const exchangeCodeForSessionMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (
      _url: string,
      _key: string,
      options: { cookies: CapturedCookieMethods },
    ) => {
      capturedCookieMethods = options.cookies;
      return { auth: { exchangeCodeForSession: exchangeCodeForSessionMock } };
    },
  ),
}));

// next/headers の cookies() は Next.js のリクエストコンテキスト
// （AsyncLocalStorage）が無いと throwForMissingRequestStore() で例外を投げる
// ため、テストから GET() を直接呼ぶには next/headers 自体を mock する必要がある
// （本番の Next.js ランタイムでは実物の cookies() が使われる）。
const cookieSetMock = vi.fn();
const cookieGetAllMock = vi.fn(() => [] as { name: string; value: string }[]);

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: cookieGetAllMock,
      set: cookieSetMock,
    }),
}));

function makeRequest(pathAndQuery: string): NextRequest {
  return new NextRequest(new URL(pathAndQuery, "https://example.com"));
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    exchangeCodeForSessionMock.mockReset();
    cookieSetMock.mockReset();
    cookieGetAllMock.mockReset().mockReturnValue([]);
    capturedCookieMethods = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("S-1: 成功時はデフォルトの /stock-items へリダイレクトし、セッション cookie を書き込む", async () => {
    exchangeCodeForSessionMock.mockImplementation(async () => {
      capturedCookieMethods?.setAll?.(
        [
          {
            name: "sb-access-token",
            value: "token-value",
            options: { path: "/" },
          },
        ],
        {
          "Cache-Control":
            "private, no-cache, no-store, must-revalidate, max-age=0",
        },
      );
      return { error: null };
    });

    const { GET } = await import("./route");
    const res = await GET(makeRequest("/auth/callback?code=abc123"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/stock-items");
    expect(cookieSetMock).toHaveBeenCalledWith(
      "sb-access-token",
      "token-value",
      {
        path: "/",
      },
    );
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("S-2: next=/join?token=xxx を保持したままリダイレクトする（join リンク経由）", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `/auth/callback?code=abc123&next=${encodeURIComponent("/join?token=xxx")}`,
      ),
    );

    expect(res.headers.get("location")).toBe(
      "https://example.com/join?token=xxx",
    );
  });

  it("S-3: exchangeCodeForSession が失敗したらエラー付きで /login へリダイレクトし、setAll で書き込まれた cookie に対して Cache-Control ヘッダを適用する", async () => {
    exchangeCodeForSessionMock.mockImplementation(async () => {
      // 失敗時でも setAll が呼ばれる場合がある
      // 例: 不正なセッションをクリアする際に setAll が呼ばれた後、エラーを返す
      capturedCookieMethods?.setAll?.(
        [
          {
            name: "sb-access-token",
            value: "",
            options: { path: "/" },
          },
        ],
        {
          "Cache-Control":
            "private, no-cache, no-store, must-revalidate, max-age=0",
        },
      );
      return { error: { message: "invalid grant" } };
    });

    const { GET } = await import("./route");
    const res = await GET(makeRequest("/auth/callback?code=bad-code"));

    expect(res.headers.get("location")).toBe(
      "https://example.com/login?error=auth_callback_failed",
    );
    // setAll で書き込まれた cookie に対して Cache-Control ヘッダが適用されていること
    expect(cookieSetMock).toHaveBeenCalledWith("sb-access-token", "", {
      path: "/",
    });
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("code パラメータが無い場合もエラー付きで /login へリダイレクトする", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest("/auth/callback"));

    expect(res.headers.get("location")).toBe(
      "https://example.com/login?error=auth_callback_failed",
    );
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("open-redirect guard: next が絶対URLの場合はデフォルトへフォールバックする", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `/auth/callback?code=abc123&next=${encodeURIComponent("https://evil.com")}`,
      ),
    );

    expect(res.headers.get("location")).toBe("https://example.com/stock-items");
  });

  it("open-redirect guard: next がプロトコル相対URL（//evil.com）の場合もフォールバックする", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `/auth/callback?code=abc123&next=${encodeURIComponent("//evil.com")}`,
      ),
    );

    expect(res.headers.get("location")).toBe("https://example.com/stock-items");
  });

  it("open-redirect guard: バックスラッシュトリック（/\\evil.com）の場合もフォールバックする", async () => {
    // WHATWG URL パーサーは特別スキーム（http/https）において先頭付近の
    // バックスラッシュを "/" として正規化するため、"/\\evil.com" は
    // "//evil.com" と同様に host が evil.com に解決されてしまう
    // （素朴な startsWith("//") チェックだけでは検出できないバイパス）。
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `/auth/callback?code=abc123&next=${encodeURIComponent("/\\evil.com")}`,
      ),
    );

    expect(res.headers.get("location")).toBe("https://example.com/stock-items");
  });

  // Regression: path-traversal-then-double-slash bypass (task-4 review finding).
  //
  // A previous implementation validated the origin of one `URL` parse of
  // `next`, then reconstructed a *string* from `pathname+search+hash` and
  // handed that string to a SECOND, independent `new URL(next, request.url)`
  // call in the GET handler. For `next=/..//evil.com`, the first parse's
  // path normalization collapses `/..//evil.com` down to pathname
  // `//evil.com` — still same-origin at that point (the leading `/..` is
  // consumed relative to the base). But re-parsing the extracted string
  // `"//evil.com"` alone, with no base to anchor it, makes the SECOND parse
  // treat it as protocol-relative and resolve to `https://evil.com/` — a
  // real off-site redirect that the origin check upstream never saw.
  //
  // The fix parses `next` exactly once and returns that validated `URL`
  // object directly to `NextResponse.redirect()`, so there is no second,
  // differently-anchored parse to disagree with the first. The safe
  // resolution keeps `..//evil.com`-style input on `example.com` (as an
  // odd-looking but harmless path), never sends it to `evil.com`.
  it.each([["/..//evil.com"], ["/.//evil.com"], ["/a/../..//evil.com"]])(
    "open-redirect guard: path-traversal-collapse bypass (%s) stays same-origin, never evil.com",
    async (nextParam) => {
      exchangeCodeForSessionMock.mockResolvedValue({ error: null });

      const { GET } = await import("./route");
      const res = await GET(
        makeRequest(
          `/auth/callback?code=abc123&next=${encodeURIComponent(nextParam)}`,
        ),
      );

      const location = res.headers.get("location");
      expect(location).not.toBeNull();
      const locationUrl = new URL(location as string);
      expect(locationUrl.origin).toBe("https://example.com");
      expect(locationUrl.origin).not.toBe("https://evil.com");
    },
  );
});
