import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StockItem } from "@/types/stockItem";
import ItemCardSimple from "./ItemCardSimple";

const baseItem: StockItem = {
  id: "1",
  name: "醤油",
  category: "調味料",
  imageUrl: null,
  sourceUrl: null,
  wantToBuy: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  sortedAt: "2026-01-01T00:00:00Z",
};

describe("ItemCardSimple", () => {
  it("商品名・カテゴリ・🛒 ボタンが表示される", () => {
    render(
      <ItemCardSimple
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(screen.getByText("醤油")).toBeInTheDocument();
    expect(screen.getByText("調味料")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "want to buy" }),
    ).toBeInTheDocument();
  });

  it("削除ボタンは描画されない", () => {
    render(
      <ItemCardSimple
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "削除" }),
    ).not.toBeInTheDocument();
  });

  it("カードをクリックすると onEdit が呼ばれる", async () => {
    const onEdit = vi.fn();
    render(
      <ItemCardSimple
        item={baseItem}
        onEdit={onEdit}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /醤油/ }));
    expect(onEdit).toHaveBeenCalledWith(baseItem);
  });

  it("🛒 ボタンをクリックすると onToggleWantToBuy が呼ばれ、onEdit は呼ばれない", async () => {
    const onEdit = vi.fn();
    const onToggleWantToBuy = vi.fn();
    render(
      <ItemCardSimple
        item={baseItem}
        onEdit={onEdit}
        onToggleWantToBuy={onToggleWantToBuy}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "want to buy" }));
    expect(onToggleWantToBuy).toHaveBeenCalledWith(baseItem);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("wantToBuy=false のとき 🛒 ボタンが aria-pressed=false で表示される", () => {
    render(
      <ItemCardSimple
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "want to buy" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("wantToBuy=true のとき 🛒 ボタンが aria-pressed=true で表示される", () => {
    const item = { ...baseItem, wantToBuy: true };
    render(
      <ItemCardSimple
        item={item}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "want to buy" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("imageUrl が null のときプレースホルダーが表示される", () => {
    render(
      <ItemCardSimple
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "画像を設定" }),
    ).toBeInTheDocument();
  });

  it("imageUrl が設定されているとき <img> が表示される", () => {
    const item = { ...baseItem, imageUrl: "https://x/a.jpg" };
    render(
      <ItemCardSimple
        item={item}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    const img = screen.getByAltText("醤油");
    expect(img).toHaveAttribute("src", "https://x/a.jpg");
  });

  it("画像ボタンをクリックすると onImageEdit が呼ばれる", () => {
    const onImageEdit = vi.fn();
    render(
      <ItemCardSimple
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={onImageEdit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "画像を設定" }));
    expect(onImageEdit).toHaveBeenCalledWith(baseItem);
  });
});
