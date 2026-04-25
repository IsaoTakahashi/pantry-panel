import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CreateItemModal from "./CreateItemModal";

describe("CreateItemModal", () => {
  it("isOpen=falseのとき何も表示しない", () => {
    render(
      <CreateItemModal isOpen={false} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("isOpen=true のとき名前・カテゴリ・送信ボタンが表示される", () => {
    render(
      <CreateItemModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(screen.getByLabelText("名前")).toBeInTheDocument();
    expect(screen.getByLabelText("カテゴリ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("名前が空のとき送信ボタンが disabled", () => {
    render(
      <CreateItemModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
  });

  it("名前とカテゴリを入力すると送信ボタンが enabled になる", async () => {
    const user = userEvent.setup();
    render(
      <CreateItemModal isOpen={true} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.selectOptions(screen.getByLabelText("カテゴリ"), "調味料");
    expect(screen.getByRole("button", { name: "追加" })).toBeEnabled();
  });

  it("送信成功で onCreate が呼ばれ onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <CreateItemModal isOpen={true} onClose={onClose} onCreate={onCreate} />,
    );
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.selectOptions(screen.getByLabelText("カテゴリ"), "調味料");
    await user.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("醤油", "調味料");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("重複エラーでエラーメッセージが表示される", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error("HTTP 409"));
    render(
      <CreateItemModal isOpen={true} onClose={vi.fn()} onCreate={onCreate} />,
    );
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.selectOptions(screen.getByLabelText("カテゴリ"), "調味料");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(screen.getByText("その商品は登録済みです")).toBeInTheDocument();
    });
  });
});
