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
});
