import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStockItem,
  deleteStockItem,
  ExtractFromUrlError,
  extractFromUrl,
  fetchHealth,
  fetchStockItems,
  ImageSearchError,
  searchImages,
  updateStockItem,
} from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchHealth", () => {
  it("正常レスポンスで HealthResponse を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", db: "connected" }), {
        status: 200,
      }),
    );

    const result = await fetchHealth();
    expect(result).toEqual({ status: "ok", db: "connected" });
  });

  it("503 レスポンスで throw される", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    await expect(fetchHealth()).rejects.toThrow("HTTP 503");
  });

  it("ネットワークエラーで throw される", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    await expect(fetchHealth()).rejects.toThrow("Failed to fetch");
  });
});

describe("fetchStockItems", () => {
  it("正常レスポンスで StockItem[] を返す", async () => {
    const items = [
      {
        id: "1",
        name: "醤油",
        category: "調味料",
        imageUrl: null,
        wantToBuy: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ];
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(items), { status: 200 }),
    );

    const result = await fetchStockItems();
    expect(result).toEqual(items);
  });

  it("エラーレスポンスでthrowされる", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await expect(fetchStockItems()).rejects.toThrow("HTTP 500");
  });

  it("accessToken を渡すと Authorization ヘッダーが付加される", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    await fetchStockItems("my-token");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: "Bearer my-token" },
      }),
    );
  });

  it("accessToken なしのとき Authorization ヘッダーなし（後方互換）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    await fetchStockItems();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: {} }),
    );
  });

  it("sends X-Active-Group-ID header when activeGroupId provided", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    await fetchStockItems("access-token", "group-uuid");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/stock-items"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Active-Group-ID": "group-uuid",
        }),
      }),
    );
  });
});

describe("createStockItem", () => {
  it("正常レスポンスで StockItem を返す", async () => {
    const item = {
      id: "1",
      name: "醤油",
      category: "調味料",
      imageUrl: null,
      wantToBuy: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(item), { status: 201 }),
    );

    const result = await createStockItem({ name: "醤油", category: "調味料" });
    expect(result).toEqual(item);
  });

  it("409レスポンスでthrowされる", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 409 }),
    );

    await expect(
      createStockItem({ name: "醤油", category: "調味料" }),
    ).rejects.toThrow("HTTP 409");
  });
});

describe("updateStockItem", () => {
  it("正常レスポンスで StockItem を返す", async () => {
    const item = {
      id: "1",
      name: "醤油",
      category: "調味料",
      imageUrl: null,
      wantToBuy: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(item), { status: 200 }),
    );

    const result = await updateStockItem("1", { name: "こいくち醤油" });
    expect(result).toEqual(item);
  });

  it("404レスポンスでthrowされる", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    await expect(
      updateStockItem("999", { name: "こいくち醤油" }),
    ).rejects.toThrow("HTTP 404");
  });

  it("409レスポンスでthrowされる", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 409 }),
    );

    await expect(updateStockItem("1", { name: "醤油" })).rejects.toThrow(
      "HTTP 409",
    );
  });
});

describe("deleteStockItem", () => {
  it("正常レスポンスで void を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await expect(deleteStockItem("1")).resolves.toBeUndefined();
  });

  it("404レスポンスでthrowされる", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    await expect(deleteStockItem("999")).rejects.toThrow("HTTP 404");
  });
});

describe("searchImages", () => {
  it("200 で ImageSearchResult[] を返す", async () => {
    const items = [
      {
        imageUrl: "https://x/a.jpg",
        thumbnailUrl: "https://x/a-t.jpg",
        title: "A",
      },
    ];
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items }), { status: 200 }),
    );

    const results = await searchImages("apple");
    expect(results).toHaveLength(1);
    expect(results[0].imageUrl).toBe("https://x/a.jpg");
    expect(results[0].thumbnailUrl).toBe("https://x/a-t.jpg");
    expect(results[0].title).toBe("A");
  });

  it("429 で ImageSearchError(kind=quota) をthrowする", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 429 }),
    );

    try {
      await searchImages("x");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ImageSearchError);
      expect((e as ImageSearchError).kind).toBe("quota");
    }
  });

  it("502 で ImageSearchError(kind=upstream) をthrowする", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 502 }),
    );

    try {
      await searchImages("x");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ImageSearchError);
      expect((e as ImageSearchError).kind).toBe("upstream");
    }
  });

  it("503 で ImageSearchError(kind=unavailable) をthrowする", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    try {
      await searchImages("x");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ImageSearchError);
      expect((e as ImageSearchError).kind).toBe("unavailable");
    }
  });

  it("その他エラーで ImageSearchError(kind=unknown) をthrowする", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    try {
      await searchImages("x");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ImageSearchError);
      expect((e as ImageSearchError).kind).toBe("unknown");
    }
  });
});

describe("extractFromUrl", () => {
  it("200 で name と imageUrl(string) を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ name: "醤油", imageUrl: "https://x/a.jpg" }),
        { status: 200 },
      ),
    );

    const result = await extractFromUrl("https://example.com/product");
    expect(result).toEqual({ name: "醤油", imageUrl: "https://x/a.jpg" });
  });

  it("200 で name と imageUrl(null) を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ name: "醤油", imageUrl: null }), {
        status: 200,
      }),
    );

    const result = await extractFromUrl("https://example.com/product");
    expect(result).toEqual({ name: "醤油", imageUrl: null });
  });

  it("400 で ExtractFromUrlError(kind=badRequest) をthrowする", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 400 }),
    );

    try {
      await extractFromUrl("not-a-url");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExtractFromUrlError);
      expect((e as ExtractFromUrlError).kind).toBe("badRequest");
    }
  });

  it("422 で ExtractFromUrlError(kind=extractionFailed) をthrowする", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 422 }),
    );

    try {
      await extractFromUrl("https://example.com/product");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExtractFromUrlError);
      expect((e as ExtractFromUrlError).kind).toBe("extractionFailed");
    }
  });

  it("502 で ExtractFromUrlError(kind=fetchFailed) をthrowする", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 502 }),
    );

    try {
      await extractFromUrl("https://example.com/product");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExtractFromUrlError);
      expect((e as ExtractFromUrlError).kind).toBe("fetchFailed");
    }
  });
});

describe("updateStockItem (imageUrl)", () => {
  it("imageUrl: string を body に含めて送信する", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          name: "醤油",
          category: "調味料",
          imageUrl: "https://x/a.jpg",
          wantToBuy: false,
          createdAt: "",
          updatedAt: "",
        }),
        { status: 200 },
      ),
    );

    await updateStockItem("1", { imageUrl: "https://x/a.jpg" });

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({ imageUrl: "https://x/a.jpg" });
  });

  it("imageUrl: null を body に含めて送信する（画像解除）", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          name: "醤油",
          category: "調味料",
          imageUrl: null,
          wantToBuy: false,
          createdAt: "",
          updatedAt: "",
        }),
        { status: 200 },
      ),
    );

    await updateStockItem("1", { imageUrl: null });

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({ imageUrl: null });
  });
});
