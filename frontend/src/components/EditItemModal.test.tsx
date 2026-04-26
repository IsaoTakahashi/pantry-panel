import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StockItem } from "@/types/stockItem";
import EditItemModal from "./EditItemModal";

const originalItem: StockItem = {
  id: "1",
  name: "醤油",
  category: "調味料",
  imageUrl: null,
  wantToBuy: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const secondItem: StockItem = {
  id: "2",
  name: "Second Item",
  category: "その他",
  imageUrl: null,
  wantToBuy: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("EditItemModal", () => {
  it("isOpen=falseのとき何も表示しない", () => {
    render(
      <EditItemModal
        item={null}
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("isOpen=true のとき対象商品の名前・カテゴリと、送信ボタンが表示される", () => {
    render(
      <EditItemModal
        item={originalItem}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("名前")).toHaveValue(originalItem.name);
    expect(screen.getByLabelText("カテゴリ")).toHaveValue(
      originalItem.category,
    );
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("名前が空のとき送信ボタンが disabled", async () => {
    const user = userEvent.setup();
    render(
      <EditItemModal
        item={originalItem}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText("名前"));
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("送信成功で onSave が呼ばれ onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <EditItemModal
        item={originalItem}
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    await user.clear(screen.getByLabelText("名前"));
    await user.type(screen.getByLabelText("名前"), "味噌");
    await user.selectOptions(screen.getByLabelText("カテゴリ"), "その他");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("味噌", "その他");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("未変更でも保存ができる", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <EditItemModal
        item={originalItem}
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("醤油", "調味料");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("重複エラーでエラーメッセージが表示される", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("HTTP 409"));
    render(
      <EditItemModal
        item={originalItem}
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.selectOptions(screen.getByLabelText("カテゴリ"), "調味料");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(screen.getByText("その商品は登録済みです")).toBeInTheDocument();
    });
  });

  it("キャンセルボタンを押すと onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(
      <EditItemModal
        item={originalItem}
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("別商品に切り替えると入力中の値が破棄され新商品の値で初期化される", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <EditItemModal
        item={originalItem}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText("名前"));
    await user.type(screen.getByLabelText("名前"), "編集中");

    rerender(
      <EditItemModal
        item={secondItem}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("名前")).toHaveValue("Second Item");
    expect(screen.getByLabelText("カテゴリ")).toHaveValue("その他");
  });
});
