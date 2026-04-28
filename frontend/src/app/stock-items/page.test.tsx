import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.restoreAllMocks(); // spyOn の復元
    vi.clearAllMocks(); // vi.mock 自動モックの呼び出し履歴クリア
  });

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

  it("削除ボタンをクリックし確認すると商品が削除される", async () => {
    const { fetchStockItems, deleteStockItem } = await import("@/lib/api");
    vi.mocked(fetchStockItems)
      .mockResolvedValueOnce(mockItems)
      .mockResolvedValueOnce([mockItems[1]]); // 削除後は味噌だけ
    vi.mocked(deleteStockItem).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    render(<StockItemsPage />);

    await waitFor(() => {
      expect(screen.getByText("醤油")).toBeInTheDocument();
    });

    const shoyuArticle = screen.getByRole("article", { name: "醤油" });
    await user.click(
      within(shoyuArticle).getByRole("button", { name: "削除" }),
    );

    await waitFor(() => {
      expect(deleteStockItem).toHaveBeenCalledWith("1");
      expect(screen.queryByText("醤油")).not.toBeInTheDocument();
    });
  });

  it("削除確認でキャンセルすると削除されない", async () => {
    const { fetchStockItems, deleteStockItem } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
    vi.mocked(deleteStockItem).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    render(<StockItemsPage />);

    await waitFor(() => {
      expect(screen.getByText("醤油")).toBeInTheDocument();
    });

    const shoyuArticle = screen.getByRole("article", { name: "醤油" });
    await user.click(
      within(shoyuArticle).getByRole("button", { name: "削除" }),
    );

    expect(deleteStockItem).not.toHaveBeenCalled();
    expect(screen.getByText("醤油")).toBeInTheDocument();
  });

  it("カードをクリックして編集すると一覧が更新される", async () => {
    const { fetchStockItems, updateStockItem } = await import("@/lib/api");
    const updatedItems = [{ ...mockItems[0], name: "濃口醤油" }, mockItems[1]];
    vi.mocked(fetchStockItems)
      .mockResolvedValueOnce(mockItems)
      .mockResolvedValueOnce(updatedItems);
    vi.mocked(updateStockItem).mockResolvedValue(updatedItems[1]);

    const user = userEvent.setup();
    render(<StockItemsPage />);

    await waitFor(() => {
      expect(screen.getByText("醤油")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /醤油/ }));

    await user.clear(screen.getByLabelText("名前"));
    await user.type(screen.getByLabelText("名前"), "濃口醤油");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateStockItem).toHaveBeenCalledWith("1", {
        name: "濃口醤油",
        category: "調味料",
      });
      expect(screen.getByText("濃口醤油")).toBeInTheDocument();
    });
  });

  it("トグルボタンをクリックするとwantToBuyが反転し一覧が更新される", async () => {
    const { fetchStockItems, updateStockItem } = await import("@/lib/api");
    const toggledItems = [{ ...mockItems[0], wantToBuy: true }, mockItems[1]];
    vi.mocked(fetchStockItems)
      .mockResolvedValueOnce(mockItems)
      .mockResolvedValueOnce(toggledItems);
    vi.mocked(updateStockItem).mockResolvedValue(toggledItems[0]);

    const user = userEvent.setup();
    render(<StockItemsPage />);

    await waitFor(() => {
      expect(screen.getByText("醤油")).toBeInTheDocument();
    });

    const shoyuArticle = screen.getByRole("article", { name: "醤油" });
    await user.click(
      within(shoyuArticle).getByRole("button", { name: "want to buy" }),
    );

    await waitFor(() => {
      expect(updateStockItem).toHaveBeenCalledWith("1", {
        wantToBuy: true,
      });
    });

    await waitFor(() => {
      const updatedShoyuArticle = screen.getByRole("article", { name: "醤油" });
      expect(
        within(updatedShoyuArticle).getByRole("button", { name: "削除" }),
      ).toBeDisabled();
    });
  });

  it("検索入力で絞り込まれ、クリアで戻る", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

    const user = userEvent.setup();
    render(<StockItemsPage />);

    // 初期: 両方表示
    await waitFor(() => {
      expect(screen.getByText("醤油")).toBeInTheDocument();
      expect(screen.getByText("味噌")).toBeInTheDocument();
    });

    // "醤" を入力 → 醤油のみ
    await user.type(screen.getByRole("searchbox"), "醤");
    expect(screen.getByText("醤油")).toBeInTheDocument();
    expect(screen.queryByText("味噌")).not.toBeInTheDocument();

    // クリアで両方戻る
    await user.click(screen.getByRole("button", { name: "クリア" }));
    expect(screen.getByText("醤油")).toBeInTheDocument();
    expect(screen.getByText("味噌")).toBeInTheDocument();
  });

  it("「買いたいものだけ」ON で wantToBuy=false が消える", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

    const user = userEvent.setup();
    render(<StockItemsPage />);

    await waitFor(() => {
      expect(screen.getByText("醤油")).toBeInTheDocument();
      expect(screen.getByText("味噌")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("checkbox", { name: "買いたいものだけ" }),
    );

    expect(screen.queryByText("醤油")).not.toBeInTheDocument(); // wantToBuy: false → 消える
    expect(screen.getByText("味噌")).toBeInTheDocument(); // wantToBuy: true → 残る
  });

  it("フィルタで 0 件のとき「該当する商品がありません」が表示される", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

    const user = userEvent.setup();
    render(<StockItemsPage />);

    await waitFor(() => {
      expect(screen.getByText("醤油")).toBeInTheDocument();
    });

    await user.type(screen.getByRole("searchbox"), "なすび");

    expect(screen.getByText("該当する商品がありません")).toBeInTheDocument();
    // raw 0 件メッセージは出ないことも確認 (Decision 6 の区別)
    expect(screen.queryByText("商品がありません")).not.toBeInTheDocument();
  });
});
