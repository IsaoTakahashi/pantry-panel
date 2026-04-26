import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StockItem } from "@/types/stockItem";
import ItemCard from "./ItemCard";

const baseItem: StockItem = {
  id: "1",
  name: "醤油",
  category: "調味料",
  imageUrl: null,
  wantToBuy: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("ItemCard", () => {
  it("商品名とカテゴリが表示される", () => {
    render(<ItemCard item={baseItem} onDelete={vi.fn()} />);
    expect(screen.getByText("醤油")).toBeInTheDocument();
    expect(screen.getByText("調味料")).toBeInTheDocument();
  });

  it("wantToBuy=false のとき削除ボタンが表示される", () => {
    render(<ItemCard item={baseItem} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
  });

  it("wantToBuy=true のとき削除ボタンが表示されない", () => {
    const item = { ...baseItem, wantToBuy: true };
    render(<ItemCard item={item} onDelete={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "削除" }),
    ).not.toBeInTheDocument();
  });

  it("削除ボタンをクリックするとonDeleteが呼ばれる", async () => {
    const onDelete = vi.fn();
    render(<ItemCard item={baseItem} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(onDelete).toHaveBeenCalledWith("1");
  });
});
