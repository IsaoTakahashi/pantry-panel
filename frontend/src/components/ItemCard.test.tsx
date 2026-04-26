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
    render(<ItemCard item={baseItem} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("醤油")).toBeInTheDocument();
    expect(screen.getByText("調味料")).toBeInTheDocument();
  });

  it("wantToBuy=false のとき削除ボタンが表示される", () => {
    render(<ItemCard item={baseItem} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
  });

  it("wantToBuy=true のとき削除ボタンが表示されない", () => {
    const item = { ...baseItem, wantToBuy: true };
    render(<ItemCard item={item} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "削除" }),
    ).not.toBeInTheDocument();
  });

  it("削除ボタンをクリックするとonDeleteが呼ばれる", async () => {
    const onDelete = vi.fn();
    render(<ItemCard item={baseItem} onEdit={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(onDelete).toHaveBeenCalledWith("1");
  });

  it("カードをクリックすると onEdit が呼ばれる", async () => {
    const onEdit = vi.fn();
    render(<ItemCard item={baseItem} onEdit={onEdit} onDelete={vi.fn()} />);
    // 商品名 "醤油" を含む button を取得 (削除ボタンと区別)
    await userEvent.click(screen.getByRole("button", { name: /醤油/ }));
    expect(onEdit).toHaveBeenCalledWith(baseItem);
  });

  it("削除ボタンをクリックしても onEdit は呼ばれない", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<ItemCard item={baseItem} onEdit={onEdit} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(onDelete).toHaveBeenCalledWith("1");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("Enter キーで onEdit が発火する", async () => {
    const onEdit = vi.fn();
    render(<ItemCard item={baseItem} onEdit={onEdit} onDelete={vi.fn()} />);
    const editButton = screen.getByRole("button", { name: /醤油/ });
    editButton.focus();
    await userEvent.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledWith(baseItem);
  });
});
