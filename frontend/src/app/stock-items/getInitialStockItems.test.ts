import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStockItems } from "@/lib/api";
import { buildSessionCookies } from "@/lib/sessionCookie";

const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
const ACTIVE_GROUP_COOKIE = "pantry-panel-active-group";

const mockCookiesGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookiesGet }),
}));

vi.mock("@/lib/api", () => ({ fetchStockItems: vi.fn() }));

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
        expect.stringContaining("fetchStockItems"),
        fetchError,
      );
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });
  });
});
