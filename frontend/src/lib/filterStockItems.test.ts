import { describe, expect, it } from "vitest";
import type { StockItem } from "@/types/stockItem";
import { filterStockItems } from "./filterStockItems";

const baseItem = (overrides: Partial<StockItem> = {}): StockItem => ({
  id: "1",
  name: "醤油",
  category: "調味料",
  imageUrl: null,
  wantToBuy: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("filterStockItems", () => {
  const items: StockItem[] = [
    baseItem({ id: "1", name: "醤油", category: "調味料", wantToBuy: false }),
    baseItem({ id: "2", name: "味噌", category: "調味料", wantToBuy: true }),
    baseItem({
      id: "3",
      name: "コーヒー",
      category: "飲み物",
      wantToBuy: true,
    }),
  ];

  it("空conditionで全件返す", () => {
    const result = filterStockItems(items, {
      searchText: "",
      wantToBuyOnly: false,
      category: null,
    });
    expect(result).toEqual(items);
  });

  it("searchTextの部分一致で絞り込む", () => {
    const result = filterStockItems(items, {
      searchText: "醤",
      wantToBuyOnly: false,
      category: null,
    });
    expect(result).toEqual([items[0]]);
  });

  it("wantToBuy=trueのとき、買いたいものだけ返す", () => {
    const result = filterStockItems(items, {
      searchText: "",
      wantToBuyOnly: true,
      category: null,
    });
    expect(result).toEqual([items[1], items[2]]);
  });

  it("category指定で該当カテゴリのみ返す", () => {
    const result = filterStockItems(items, {
      searchText: "",
      wantToBuyOnly: false,
      category: "調味料",
    });
    expect(result).toEqual([items[0], items[1]]);
  });

  it("category=nullで全カテゴリを返す", () => {
    const result = filterStockItems(items, {
      searchText: "",
      wantToBuyOnly: false,
      category: null,
    });
    expect(result).toEqual(items);
  });

  it("複数条件の組み合わせ", () => {
    const result = filterStockItems(items, {
      searchText: "コー",
      wantToBuyOnly: true,
      category: "飲み物",
    });
    expect(result).toEqual([items[2]]);
  });
});
