import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStockItem,
  deleteStockItem,
  fetchHealth,
  fetchStockItems,
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
