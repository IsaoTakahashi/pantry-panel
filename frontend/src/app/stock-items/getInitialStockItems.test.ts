import { stringToBase64URL } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStockItems, HttpError } from "@/lib/api";
import { buildSessionCookies } from "@/lib/sessionCookie";

const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
const ACTIVE_GROUP_COOKIE = "pantry-panel-active-group";

const mockCookiesGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookiesGet }),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchStockItems: vi.fn(),
}));

// redirect() は実際には例外を投げて制御を止める。モックも同じ挙動にする。
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// stock-items-ttfb-reduction Phase 2 (tasks.md 3.1): getInitialStockItems.ts は
// もう Supabase クライアントを一切生成・呼び出してはならない
// （middleware が検証・リフレッシュ済みの cookie から直接 access_token を
// 読み取るようになったため）。createSupabaseServerClient をモックして spy し、
// このモジュールが一度も呼んでいないことを確認する。
const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

function cookieMap(entries: Record<string, string>) {
  return (name: string) =>
    name in entries ? { value: entries[name] } : undefined;
}

function authTokenCookieEntries(accessToken: string): Record<string, string> {
  const session = { access_token: accessToken } as unknown as Session;
  const cookies = buildSessionCookies(SUPABASE_URL, session);
  return Object.fromEntries(cookies.map((c) => [c.name, c.value]));
}

function jwtWithPayload(payload: unknown): string {
  return `h.${stringToBase64URL(JSON.stringify(payload))}.s`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

function setupCookies(accessToken: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  mockCookiesGet.mockImplementation(
    cookieMap({
      [ACTIVE_GROUP_COOKIE]: "group-1",
      ...authTokenCookieEntries(accessToken),
    }),
  );
}

describe("getInitialStockItems", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("cookie未設定のとき null を返し、fetchStockItems を呼ばない", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(cookieMap({}));
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("auth-token cookie が無いとき null を返し、fetchStockItems を呼ばない", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({ [ACTIVE_GROUP_COOKIE]: "group-1" }),
    );
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("cookieとauth-tokenが揃っているとき fetchStockItems の結果を返す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({
        [ACTIVE_GROUP_COOKIE]: "group-1",
        ...authTokenCookieEntries("tok"),
      }),
    );
    const items = [
      {
        id: "1",
        name: "商品A",
        category: "調味料",
        imageUrl: null,
        sourceUrl: null,
        wantToBuy: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        sortedAt: "2026-01-01T00:00:00Z",
      },
    ];
    vi.mocked(fetchStockItems).mockResolvedValue(items);
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toEqual(items);
    expect(fetchStockItems).toHaveBeenCalledWith("tok", "group-1");
  });

  it("createSupabaseServerClient を一度も呼ばない（Supabaseへの呼び出しが発生しないことの確認）", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({
        [ACTIVE_GROUP_COOKIE]: "group-1",
        ...authTokenCookieEntries("tok"),
      }),
    );
    vi.mocked(fetchStockItems).mockResolvedValue([]);
    const { getInitialStockItems } = await import("./getInitialStockItems");

    await getInitialStockItems();

    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("fetchStockItems が失敗したら null を返す（エラーを投げない）", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({
        [ACTIVE_GROUP_COOKIE]: "group-1",
        ...authTokenCookieEntries("tok"),
      }),
    );
    vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
  });

  it("auth-token cookie の値が不正(JSON parse失敗)のとき null を返し、fetchStockItems を呼ばない", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({
        [ACTIVE_GROUP_COOKIE]: "group-1",
        "sb-abcdefghijklmnop-auth-token": "not-valid",
      }),
    );
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("Supabase env未設定（NEXT_PUBLIC_SUPABASE_URL無し）のとき null を返す", async () => {
    mockCookiesGet.mockImplementation(
      cookieMap({ [ACTIVE_GROUP_COOKIE]: "group-1" }),
    );
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  // Phase 0 (tasks.md 1.2) の観測性を Phase 2 の実装（getSession() 廃止）に
  // 合わせて更新する。getSession の代わりに access_token を cookie から直接
  // 読み取る区間（readAccessTokenFromCookies）の所要時間を計測・ログ出力する。
  describe("観測性: readAccessTokenFromCookies/fetchStockItems の所要時間をログ出力する", () => {
    it("cookieとauth-tokenが揃っているとき、両区間の所要時間がログ出力される", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCookiesGet.mockImplementation(
        cookieMap({
          [ACTIVE_GROUP_COOKIE]: "group-1",
          ...authTokenCookieEntries("tok"),
        }),
      );
      vi.mocked(fetchStockItems).mockResolvedValue([]);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/readAccessTokenFromCookies.*dur=\d+(\.\d+)?/),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/fetchStockItems.*dur=\d+(\.\d+)?/),
      );
      logSpy.mockRestore();
    });

    it("auth-token cookie が無いとき、readAccessTokenFromCookies の所要時間のみログ出力され fetchStockItems 分は出力されない", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCookiesGet.mockImplementation(
        cookieMap({ [ACTIVE_GROUP_COOKIE]: "group-1" }),
      );
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/readAccessTokenFromCookies.*dur=\d+(\.\d+)?/),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/fetchStockItems.*dur=\d+(\.\d+)?/),
      );
      logSpy.mockRestore();
    });

    it("fetchStockItems が reject したとき、console.error でエラーが記録される", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockCookiesGet.mockImplementation(
        cookieMap({
          [ACTIVE_GROUP_COOKIE]: "group-1",
          ...authTokenCookieEntries("tok"),
        }),
      );
      const fetchError = new Error("HTTP 500");
      vi.mocked(fetchStockItems).mockRejectedValue(fetchError);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("fetchStockItems failed"),
        fetchError,
      );
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe("401 の分岐（Go API の 401 がトークン無効の根拠）", () => {
    it("401 でトークンの exp が未来のとき、/auth/clear-session へ redirect し、null を resolve しない", async () => {
      setupCookies(jwtWithPayload({ exp: nowSec() + 3600 }));
      vi.mocked(fetchStockItems).mockRejectedValue(new HttpError(401));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await expect(getInitialStockItems()).rejects.toThrow(
        "NEXT_REDIRECT:/auth/clear-session",
      );
      expect(mockRedirect).toHaveBeenCalledWith("/auth/clear-session");
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining("401 with unexpired token, redirecting"),
      );
      errSpy.mockRestore();
    });

    it("401 で exp が読み取れないトークン(payload 壊れ)のとき、redirect する", async () => {
      setupCookies("not-a-jwt");
      vi.mocked(fetchStockItems).mockRejectedValue(new HttpError(401));
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await expect(getInitialStockItems()).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/auth/clear-session");
    });

    it("401 で exp が無いトークンのとき、redirect する", async () => {
      setupCookies(jwtWithPayload({ sub: "u" }));
      vi.mocked(fetchStockItems).mockRejectedValue(new HttpError(401));
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await expect(getInitialStockItems()).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/auth/clear-session");
    });

    it("401 で exp が過去のとき、null を返し redirect しない", async () => {
      setupCookies(jwtWithPayload({ exp: nowSec() - 10 }));
      vi.mocked(fetchStockItems).mockRejectedValue(new HttpError(401));
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { getInitialStockItems } = await import("./getInitialStockItems");

      const result = await getInitialStockItems();

      expect(result).toBeNull();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("401 with expired token, returning null"),
      );
      logSpy.mockRestore();
    });

    it("401 で exp が現在時刻ちょうどのとき、期限切れ側として null を返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      try {
        setupCookies(jwtWithPayload({ exp: Math.floor(Date.now() / 1000) }));
        vi.mocked(fetchStockItems).mockRejectedValue(new HttpError(401));
        const { getInitialStockItems } = await import("./getInitialStockItems");

        expect(await getInitialStockItems()).toBeNull();
        expect(mockRedirect).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("401 以外の失敗は null（redirect しない）", () => {
    it.each([
      ["403", new HttpError(403)],
      ["500", new HttpError(500)],
      ["503 (signing key unavailable)", new HttpError(503)],
      ["timeout", new DOMException("timed out", "TimeoutError")],
      ["network", new TypeError("fetch failed")],
    ])("%s のとき null を返し、失敗ログを出す", async (_label, error) => {
      setupCookies(jwtWithPayload({ exp: nowSec() + 3600 }));
      vi.mocked(fetchStockItems).mockRejectedValue(error);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { getInitialStockItems } = await import("./getInitialStockItems");

      expect(await getInitialStockItems()).toBeNull();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("fetchStockItems failed, returning null"),
        error,
      );
      errorSpy.mockRestore();
    });
  });

  it("件数が多くても fetchStockItems を 1 回だけ呼び、全件を返す", async () => {
    setupCookies(jwtWithPayload({ exp: nowSec() + 3600 }));
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      name: `item-${i}`,
      category: "調味料",
      imageUrl: null,
      sourceUrl: null,
      wantToBuy: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      sortedAt: "2026-01-01T00:00:00Z",
    }));
    vi.mocked(fetchStockItems).mockResolvedValue(many);
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toHaveLength(500);
    expect(fetchStockItems).toHaveBeenCalledTimes(1);
  });
});
