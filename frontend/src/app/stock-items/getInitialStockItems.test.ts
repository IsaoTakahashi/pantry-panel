import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStockItems } from "@/lib/api";

const mockCookiesGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookiesGet }),
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getSession: mockGetSession },
  })),
}));

vi.mock("@/lib/api", () => ({ fetchStockItems: vi.fn() }));

describe("getInitialStockItems", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cookie未設定のとき null を返し、fetchStockItems を呼ばない", async () => {
    mockCookiesGet.mockReturnValue(undefined);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("セッションが取得できないとき null を返す", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("cookieとセッションが揃っているとき fetchStockItems の結果を返す", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
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

  it("fetchStockItems が失敗したら null を返す（エラーを投げない）", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
  });

  it("getSession が reject したら null を返す（エラーを投げない）", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    mockGetSession.mockRejectedValue(new Error("cookie JSON parse error"));
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("Supabase env未設定（createSupabaseServerClientがnullを返す）のとき null を返す", async () => {
    const { createSupabaseServerClient } = await import(
      "@/lib/supabaseServerClient"
    );
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce(null as never);
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
  });

  // Phase 0 (stock-items-ttfb-reduction tasks.md 1.2): 本番での cold 時 TTFB
  // 内訳を判断するため、getSession() と fetchStockItems() それぞれの所要時間を
  // 計測しログ出力する。Server Component はレスポンスヘッダーを書けないため
  // （middleware.ts の Server-Timing とは異なり）構造化ログで代替する。
  describe("観測性: getSession/fetchStockItems の所要時間をログ出力する", () => {
    it("cookieとセッションが揃っているとき、getSession と fetchStockItems 双方の所要時間がログ出力される", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCookiesGet.mockImplementation((name: string) =>
        name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
      );
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: "tok" } },
      });
      vi.mocked(fetchStockItems).mockResolvedValue([]);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/getSession.*dur=\d+(\.\d+)?/),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/fetchStockItems.*dur=\d+(\.\d+)?/),
      );
      logSpy.mockRestore();
    });

    it("セッションが取得できないとき、getSession の所要時間のみログ出力され fetchStockItems 分は出力されない", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCookiesGet.mockImplementation((name: string) =>
        name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
      );
      mockGetSession.mockResolvedValue({ data: { session: null } });
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/getSession.*dur=\d+(\.\d+)?/),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/fetchStockItems.*dur=\d+(\.\d+)?/),
      );
      logSpy.mockRestore();
    });

    it("getSession が reject したとき、getSession の所要時間がログ出力される", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCookiesGet.mockImplementation((name: string) =>
        name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
      );
      mockGetSession.mockRejectedValue(new Error("cookie JSON parse error"));
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/getSession.*dur=\d+(\.\d+)?/),
      );
      logSpy.mockRestore();
    });

    it("fetchStockItems が reject したとき、getSession と fetchStockItems 双方の所要時間がログ出力される", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCookiesGet.mockImplementation((name: string) =>
        name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
      );
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: "tok" } },
      });
      vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/getSession.*dur=\d+(\.\d+)?/),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/fetchStockItems.*dur=\d+(\.\d+)?/),
      );
      logSpy.mockRestore();
    });

    // reject時の所要時間ログは成功時と同一の書式（`<name>;dur=<ms>`）になる
    // ため、ログの数値だけでは「遅い成功」と「失敗」を区別できない。
    // middleware.ts の claimsDurationMs 計測は console.error でエラー内容も
    // 併記しており、失敗を識別可能にしている。ここでも同様に、reject時は
    // console.error でエラーを記録し、失敗したリクエストが計測データに
    // 紛れ込まないようにする。
    it("getSession が reject したとき、console.error でエラーが記録される", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockCookiesGet.mockImplementation((name: string) =>
        name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
      );
      const sessionError = new Error("cookie JSON parse error");
      mockGetSession.mockRejectedValue(sessionError);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("getSession"),
        sessionError,
      );
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("fetchStockItems が reject したとき、console.error でエラーが記録される", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockCookiesGet.mockImplementation((name: string) =>
        name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
      );
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: "tok" } },
      });
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
