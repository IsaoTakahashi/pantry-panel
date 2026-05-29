import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StockItem } from "@/types/stockItem";
import ItemCard from "./ItemCard";

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

describe("ItemCard", () => {
  it("商品名とカテゴリが表示される", () => {
    render(
      <ItemCard
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(screen.getByText("醤油")).toBeInTheDocument();
    expect(screen.getByText("調味料")).toBeInTheDocument();
  });

  it("wantToBuy=false のとき削除ボタンが表示される", () => {
    render(
      <ItemCard
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
  });

  it("wantToBuy=true のとき削除ボタンが disabled になる", () => {
    const item = { ...baseItem, wantToBuy: true };
    render(
      <ItemCard
        item={item}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
  });

  it("削除ボタンをクリックするとonDeleteが呼ばれる", async () => {
    const onDelete = vi.fn();
    render(
      <ItemCard
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={onDelete}
        onImageEdit={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(onDelete).toHaveBeenCalledWith(baseItem);
  });

  it("カードをクリックすると onEdit が呼ばれる", async () => {
    const onEdit = vi.fn();
    render(
      <ItemCard
        item={baseItem}
        onEdit={onEdit}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    // 商品名 "醤油" を含む button を取得 (削除ボタンと区別)
    await userEvent.click(screen.getByRole("button", { name: /醤油/ }));
    expect(onEdit).toHaveBeenCalledWith(baseItem);
  });

  it("削除ボタンをクリックしても onEdit は呼ばれない", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <ItemCard
        item={baseItem}
        onEdit={onEdit}
        onToggleWantToBuy={vi.fn()}
        onDelete={onDelete}
        onImageEdit={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(onDelete).toHaveBeenCalledWith(baseItem);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("Enter キーで onEdit が発火する", async () => {
    const onEdit = vi.fn();
    render(
      <ItemCard
        item={baseItem}
        onEdit={onEdit}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    const editButton = screen.getByRole("button", { name: /醤油/ });
    editButton.focus();
    await userEvent.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledWith(baseItem);
  });

  it("wantToBuy=falseのときトグルボタンがaria-pressed=falseで表示される", () => {
    render(
      <ItemCard
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "want to buy" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("wantToBuy=trueのときトグルボタンがaria-pressed=trueで表示され、削除ボタンはdisabledになる", () => {
    const item = { ...baseItem, wantToBuy: true };
    render(
      <ItemCard
        item={item}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "want to buy" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
  });

  it("トグルボタンをクリックすると onToggleWantToBuy が呼ばれ、onEdit は呼ばれない", async () => {
    const onToggleWantToBuy = vi.fn();
    const onEdit = vi.fn();
    render(
      <ItemCard
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

  it("imageUrl が null のときプレースホルダーが表示される", () => {
    render(
      <ItemCard
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
      <ItemCard
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
      <ItemCard
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

  // Scenario: E-3
  it("wantToBuy=true のとき、カートアイコンボタンに text-blue-500 クラスが付く", () => {
    const item = { ...baseItem, wantToBuy: true };
    render(
      <ItemCard
        item={item}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "want to buy" });
    expect(toggle).toHaveClass("text-blue-500");
  });

  // Scenario: J-1-4
  it("sourceUrl が非 null のとき、外部リンクアイコンが表示される", () => {
    const item = { ...baseItem, sourceUrl: "https://example.com/product" };
    render(
      <ItemCard
        item={item}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "商品ページを開く" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/product");
  });

  // Scenario: J-1-4
  it("sourceUrl が null のとき、外部リンクアイコンが表示されない", () => {
    render(
      <ItemCard
        item={baseItem}
        onEdit={vi.fn()}
        onToggleWantToBuy={vi.fn()}
        onDelete={vi.fn()}
        onImageEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link", { name: "商品ページを開く" })).toBeNull();
  });
});
