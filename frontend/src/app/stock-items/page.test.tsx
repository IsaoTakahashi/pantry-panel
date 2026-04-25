import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StockItemsPage from "@/app/stock-items/page";

vi.mock("@/lib/api");

const mockItems = [
  {
    id: "1",
    name: "醤油",
    category: "調味料",
    imageUrl: null,
    wantToBuy: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "2",
    name: "味噌",
    category: "調味料",
    imageUrl: null,
    wantToBuy: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

describe("StockItemsPage", () => {
  it("ローディング中にloadingが表示される", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockReturnValue(new Promise(() => {})); // 解決しないPromiseを返す

    render(<StockItemsPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("商品一覧が表示される", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

    render(<StockItemsPage />);
    await waitFor(() => {
      expect(screen.getByText("醤油")).toBeInTheDocument();
      expect(screen.getByText("味噌")).toBeInTheDocument();
    });
  });

  it("商品がないときからメッセージが表示される", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockResolvedValue([]);

    render(<StockItemsPage />);
    await waitFor(() => {
      expect(screen.getByText("商品がありません")).toBeInTheDocument();
    });
  });

  it("APIエラー時にエラーメッセージが表示される", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));

    render(<StockItemsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("商品を取得できませんでした"),
      ).toBeInTheDocument();
    });
  });
});
