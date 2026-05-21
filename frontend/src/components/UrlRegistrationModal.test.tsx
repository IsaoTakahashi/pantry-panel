import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractFromUrlError, extractFromUrl } from "@/lib/api";
import UrlRegistrationModal from "./UrlRegistrationModal";

// vi.spyOn cannot intercept ESM named exports in the component; use vi.mock instead
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, extractFromUrl: vi.fn() };
});

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onExtracted: vi.fn(),
};

afterEach(() => {
  vi.mocked(extractFromUrl).mockReset();
  vi.mocked(defaultProps.onClose).mockReset();
  vi.mocked(defaultProps.onExtracted).mockReset();
});

describe("UrlRegistrationModal", () => {
  it("isOpen=true のとき URL 入力フォームが表示される", () => {
    render(<UrlRegistrationModal {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("商品ページの URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "抽出" })).toBeInTheDocument();
  });

  it("isOpen=false のときモーダルが表示されない", () => {
    render(<UrlRegistrationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("URL を入力して送信すると extractFromUrl が呼ばれローディング状態になる", async () => {
    const user = userEvent.setup();
    // Never resolves during this test — keep loading state visible
    vi.mocked(extractFromUrl).mockReturnValue(new Promise(() => {}));

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    expect(extractFromUrl).toHaveBeenCalledWith(
      "https://example.com",
      undefined,
      undefined,
    );
    expect(screen.getByText("解析中...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "抽出" })).toBeDisabled();
  });

  it("抽出成功で onExtracted(name, imageUrl) が呼ばれる", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrl).mockResolvedValue({
      name: "テスト商品",
      imageUrl: "https://example.com/img.jpg",
    });
    const onExtracted = vi.fn();

    render(
      <UrlRegistrationModal {...defaultProps} onExtracted={onExtracted} />,
    );
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    await waitFor(() => {
      expect(onExtracted).toHaveBeenCalledWith(
        "テスト商品",
        "https://example.com/img.jpg",
      );
    });
  });

  it("accessToken と activeGroupId が extractFromUrl に渡される", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrl).mockResolvedValue({
      name: "商品",
      imageUrl: null,
    });

    render(
      <UrlRegistrationModal
        {...defaultProps}
        accessToken="token-abc"
        activeGroupId="group-xyz"
      />,
    );
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    await waitFor(() => {
      expect(extractFromUrl).toHaveBeenCalledWith(
        "https://example.com",
        "token-abc",
        "group-xyz",
      );
    });
  });

  it("fetchFailed エラーで「ページを取得できませんでした」が表示される", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrl).mockRejectedValue(
      new ExtractFromUrlError("fetchFailed"),
    );

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    expect(
      await screen.findByText("ページを取得できませんでした"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("extractionFailed エラーで「商品情報を取得できませんでした」と「手動で入力する」ボタンが表示され、クリックで onExtracted('', null) が呼ばれる", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrl).mockRejectedValue(
      new ExtractFromUrlError("extractionFailed"),
    );
    const onExtracted = vi.fn();

    render(
      <UrlRegistrationModal {...defaultProps} onExtracted={onExtracted} />,
    );
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    expect(
      await screen.findByText(
        "商品情報を取得できませんでした。手動で入力してください",
      ),
    ).toBeInTheDocument();

    const manualButton = screen.getByRole("button", { name: "手動で入力する" });
    expect(manualButton).toBeInTheDocument();
    fireEvent.click(manualButton);
    expect(onExtracted).toHaveBeenCalledWith("", null);
  });

  it("badRequest エラーで「有効な URL を入力してください」が表示される", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrl).mockRejectedValue(
      new ExtractFromUrlError("badRequest"),
    );

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(screen.getByLabelText("商品ページの URL"), "not-a-url");
    await user.click(screen.getByRole("button", { name: "抽出" }));

    expect(
      await screen.findByText("有効な URL を入力してください"),
    ).toBeInTheDocument();
  });

  it("unknown エラーで「エラーが発生しました」が表示される", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrl).mockRejectedValue(new Error("unexpected"));

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    expect(await screen.findByText("エラーが発生しました")).toBeInTheDocument();
  });

  it("再試行ボタンをクリックすると extractFromUrl が再呼び出しされる", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrl).mockRejectedValueOnce(
      new ExtractFromUrlError("fetchFailed"),
    );
    vi.mocked(extractFromUrl).mockResolvedValueOnce({
      name: "再試行成功商品",
      imageUrl: null,
    });
    const onExtracted = vi.fn();

    render(
      <UrlRegistrationModal {...defaultProps} onExtracted={onExtracted} />,
    );
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    await screen.findByText("ページを取得できませんでした");
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => {
      expect(onExtracted).toHaveBeenCalledWith("再試行成功商品", null);
    });
    expect(extractFromUrl).toHaveBeenCalledTimes(2);
  });

  it("キャンセルボタンで onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<UrlRegistrationModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("URL が空のとき抽出ボタンが disabled", () => {
    render(<UrlRegistrationModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: "抽出" })).toBeDisabled();
  });

  it("モーダルを閉じて再度開くと入力と状態がリセットされる", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrl).mockRejectedValue(
      new ExtractFromUrlError("fetchFailed"),
    );

    const { rerender } = render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));
    await screen.findByText("ページを取得できませんでした");

    rerender(<UrlRegistrationModal {...defaultProps} isOpen={false} />);
    rerender(<UrlRegistrationModal {...defaultProps} isOpen={true} />);

    expect(screen.getByLabelText("商品ページの URL")).toHaveValue("");
    expect(
      screen.queryByText("ページを取得できませんでした"),
    ).not.toBeInTheDocument();
  });
});
