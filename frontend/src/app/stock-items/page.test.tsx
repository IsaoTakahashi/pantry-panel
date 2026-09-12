import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getInitialStockItems } from "./getInitialStockItems";
import StockItemsPage from "./page";

vi.mock("./getInitialStockItems", () => ({
  getInitialStockItems: vi.fn(),
}));
vi.mock("./StockItemsClient", () => ({
  default: ({ initialItems }: { initialItems: unknown }) => (
    <span>initialItems:{JSON.stringify(initialItems)}</span>
  ),
}));

describe("StockItemsPage (Server Component)", () => {
  it("getInitialStockItems の結果を StockItemsClient に initialItems として渡す", async () => {
    vi.mocked(getInitialStockItems).mockResolvedValue([
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
    ]);

    const element = await StockItemsPage();
    render(element);

    expect(screen.getByText(/"name":"商品A"/)).toBeInTheDocument();
  });

  it("getInitialStockItems が null を返したとき StockItemsClient に null を渡す", async () => {
    vi.mocked(getInitialStockItems).mockResolvedValue(null);

    const element = await StockItemsPage();
    render(element);

    expect(screen.getByText("initialItems:null")).toBeInTheDocument();
  });
});
