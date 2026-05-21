import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CreateItemModal from "./CreateItemModal";

const defaultProps = {
  isOpen: true,
  initialName: "",
  initialCategory: "★",
  initialWantToBuy: false,
  onClose: vi.fn(),
  onCreate: vi.fn(),
};

describe("CreateItemModal", () => {
  it("isOpen=falseのとき何も表示しない", () => {
    render(<CreateItemModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("isOpen=true のとき名前・カテゴリ・送信ボタンが表示される", () => {
    render(<CreateItemModal {...defaultProps} />);
    expect(screen.getByLabelText("名前")).toBeInTheDocument();
    expect(screen.getByLabelText("カテゴリ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("名前が空のとき送信ボタンが disabled", () => {
    render(<CreateItemModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
  });

  it("名前を入力すると送信ボタンが enabled になる（カテゴリは初期値で常に有効）", async () => {
    const user = userEvent.setup();
    render(<CreateItemModal {...defaultProps} />);
    await user.type(screen.getByLabelText("名前"), "醤油");
    expect(screen.getByRole("button", { name: "追加" })).toBeEnabled();
  });

  it("送信成功で onCreate が呼ばれ onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <CreateItemModal
        {...defaultProps}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.selectOptions(screen.getByLabelText("カテゴリ"), "調味料");
    await user.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("醤油", "調味料", false, null);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("重複エラーでエラーメッセージが表示される", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error("HTTP 409"));
    render(<CreateItemModal {...defaultProps} onCreate={onCreate} />);
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(screen.getByText("その商品は登録済みです")).toBeInTheDocument();
    });
  });

  it("キャンセルボタンを押すと onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateItemModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("キャンセル後に再度開くと入力がリセットされる", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CreateItemModal {...defaultProps} />);
    await user.type(screen.getByLabelText("名前"), "醤油");
    rerender(<CreateItemModal {...defaultProps} isOpen={false} />);
    rerender(<CreateItemModal {...defaultProps} isOpen={true} />);
    expect(screen.getByLabelText("名前")).toHaveValue("");
  });

  it("送信成功後に再度開くと入力がリセットされる", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <CreateItemModal {...defaultProps} onCreate={onCreate} />,
    );
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.click(screen.getByRole("button", { name: "追加" }));
    rerender(
      <CreateItemModal {...defaultProps} isOpen={false} onCreate={onCreate} />,
    );
    rerender(
      <CreateItemModal {...defaultProps} isOpen={true} onCreate={onCreate} />,
    );
    expect(screen.getByLabelText("名前")).toHaveValue("");
  });

  it("初期カテゴリは initialCategory で選択される (★)", () => {
    render(<CreateItemModal {...defaultProps} initialCategory="★" />);
    expect(screen.getByLabelText("カテゴリ")).toHaveValue("★");
  });

  it("初期カテゴリは initialCategory で選択される (調味料)", () => {
    render(<CreateItemModal {...defaultProps} initialCategory="調味料" />);
    expect(screen.getByLabelText("カテゴリ")).toHaveValue("調味料");
  });

  it("「選択してください」option は存在しない", () => {
    render(<CreateItemModal {...defaultProps} />);
    const select = screen.getByLabelText("カテゴリ") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).not.toContain("");
  });

  it("再度開くときに新しい initialCategory にリセットされる", () => {
    const { rerender } = render(<CreateItemModal {...defaultProps} />);
    rerender(<CreateItemModal {...defaultProps} isOpen={false} />);
    rerender(
      <CreateItemModal
        {...defaultProps}
        isOpen={true}
        initialCategory="調味料"
      />,
    );
    expect(screen.getByLabelText("カテゴリ")).toHaveValue("調味料");
  });

  it("initialName が指定されると名前フィールドに初期入力される", () => {
    render(<CreateItemModal {...defaultProps} initialName="醤油" />);
    expect(screen.getByLabelText("名前")).toHaveValue("醤油");
  });

  it("initialName が空文字の場合は名前フィールドも空", () => {
    render(<CreateItemModal {...defaultProps} initialName="" />);
    expect(screen.getByLabelText("名前")).toHaveValue("");
  });

  it("initialWantToBuy=true のとき買いたいトグルが ON になる", () => {
    render(<CreateItemModal {...defaultProps} initialWantToBuy={true} />);
    expect(screen.getByRole("button", { name: "買いたい" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("initialWantToBuy=false のとき買いたいトグルが OFF になる", () => {
    render(<CreateItemModal {...defaultProps} initialWantToBuy={false} />);
    expect(screen.getByRole("button", { name: "買いたい" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("モーダルを閉じて再度開くと initialName / initialWantToBuy で再初期化される", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CreateItemModal
        {...defaultProps}
        initialName="醤油"
        initialWantToBuy={true}
      />,
    );
    await user.clear(screen.getByLabelText("名前"));
    await user.click(screen.getByRole("button", { name: "買いたい" }));

    rerender(
      <CreateItemModal
        {...defaultProps}
        isOpen={false}
        initialName="醤油"
        initialWantToBuy={true}
      />,
    );
    rerender(
      <CreateItemModal
        {...defaultProps}
        isOpen={true}
        initialName="醤油"
        initialWantToBuy={true}
      />,
    );

    expect(screen.getByLabelText("名前")).toHaveValue("醤油");
    expect(screen.getByRole("button", { name: "買いたい" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("initialImageUrl が指定されると onCreate に imageUrl が渡される", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateItemModal
        {...defaultProps}
        initialImageUrl="https://example.com/image.jpg"
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        "醤油",
        "★",
        false,
        "https://example.com/image.jpg",
      );
    });
  });

  it("initialImageUrl が null のとき onCreate に null が渡される", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateItemModal
        {...defaultProps}
        initialImageUrl={null}
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("醤油", "★", false, null);
    });
  });

  it("initialImageUrl が undefined のとき onCreate に null が渡される", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateItemModal {...defaultProps} onCreate={onCreate} />);
    await user.type(screen.getByLabelText("名前"), "醤油");
    await user.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("醤油", "★", false, null);
    });
  });

  it("モーダルを再度開くと initialImageUrl でリセットされる", () => {
    const { rerender } = render(
      <CreateItemModal
        {...defaultProps}
        initialName="醤油"
        initialImageUrl="https://example.com/image.jpg"
      />,
    );
    rerender(
      <CreateItemModal
        {...defaultProps}
        isOpen={false}
        initialName="醤油"
        initialImageUrl={null}
      />,
    );
    const onCreate = vi.fn().mockResolvedValue(undefined);
    rerender(
      <CreateItemModal
        {...defaultProps}
        isOpen={true}
        initialName="醤油"
        initialImageUrl={null}
        onCreate={onCreate}
      />,
    );
    // imageUrl state is internal; verify it resets by submitting and checking the call
    screen.getByRole("button", { name: "追加" }).click();
    expect(onCreate).toHaveBeenCalledWith("醤油", "★", false, null);
  });
});
