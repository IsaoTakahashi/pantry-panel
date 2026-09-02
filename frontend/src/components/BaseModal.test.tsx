import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import BaseModal from "./BaseModal";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  m: {
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

describe("BaseModal", () => {
  it("isOpen=false のとき dialog が表示されない", () => {
    mockMatchMedia(false);
    render(
      <BaseModal isOpen={false} onClose={vi.fn()} title="テスト">
        <p>コンテンツ</p>
      </BaseModal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("isOpen=true のとき dialog とタイトルと children が表示される", () => {
    mockMatchMedia(false);
    render(
      <BaseModal isOpen={true} onClose={vi.fn()} title="商品を追加">
        <p>フォームコンテンツ</p>
      </BaseModal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("商品を追加")).toBeInTheDocument();
    expect(screen.getByText("フォームコンテンツ")).toBeInTheDocument();
  });

  it("閉じるボタンを押すと onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockMatchMedia(false);
    render(
      <BaseModal isOpen={true} onClose={onClose} title="テスト">
        <p>中身</p>
      </BaseModal>,
    );
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc キーで onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockMatchMedia(false);
    render(
      <BaseModal isOpen={true} onClose={onClose} title="テスト">
        <p>中身</p>
      </BaseModal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("スクリムクリックで onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockMatchMedia(false);
    render(
      <BaseModal isOpen={true} onClose={onClose} title="テスト">
        <p>中身</p>
      </BaseModal>,
    );
    await user.click(screen.getByTestId("modal-scrim"));
    expect(onClose).toHaveBeenCalled();
  });

  it("デスクトップ表示（matchMedia matches=true）でも dialog が表示される", () => {
    mockMatchMedia(true);
    render(
      <BaseModal isOpen={true} onClose={vi.fn()} title="デスクトップ">
        <p>内容</p>
      </BaseModal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("デスクトップ")).toBeInTheDocument();
  });

  it("isOpen が true → false になるとダイアログが DOM から消える", () => {
    mockMatchMedia(false);
    const { rerender } = render(
      <BaseModal isOpen={true} onClose={vi.fn()} title="テスト">
        <p>中身</p>
      </BaseModal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(
      <BaseModal isOpen={false} onClose={vi.fn()} title="テスト">
        <p>中身</p>
      </BaseModal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("isOpen=false のとき Esc を押しても onClose が呼ばれない", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockMatchMedia(false);
    render(
      <BaseModal isOpen={false} onClose={onClose} title="テスト">
        <p>中身</p>
      </BaseModal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
