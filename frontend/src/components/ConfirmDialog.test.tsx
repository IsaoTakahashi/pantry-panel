import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({
      children,
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      drag: _drag,
      dragControls: _dc,
      dragListener: _dl,
      dragConstraints: _dcon,
      dragElastic: _de,
      onDragEnd: _ode,
      ...rest
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
      <div {...rest}>{children}</div>
    ),
  },
  useDragControls: () => ({ start: vi.fn() }),
}));

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ConfirmDialog", () => {
  it("isOpen=true のとき message とボタンが表示される", () => {
    mockMatchMedia(false);
    render(
      <ConfirmDialog
        isOpen={true}
        message="本当に削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("本当に削除しますか？")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "キャンセル" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認" })).toBeInTheDocument();
  });

  it("キャンセルボタンを押すと onCancel が呼ばれる", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    mockMatchMedia(false);
    render(
      <ConfirmDialog
        isOpen={true}
        message="削除しますか？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("確認ボタンを押すと onConfirm が呼ばれる", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    mockMatchMedia(false);
    render(
      <ConfirmDialog
        isOpen={true}
        message="削除しますか？"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("isOpen=false のときダイアログが表示されない", () => {
    mockMatchMedia(false);
    render(
      <ConfirmDialog
        isOpen={false}
        message="削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
