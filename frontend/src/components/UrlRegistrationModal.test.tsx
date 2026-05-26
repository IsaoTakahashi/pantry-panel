import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractFromUrlError, extractFromUrlStream } from "@/lib/api";
import UrlRegistrationModal from "./UrlRegistrationModal";

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
      ...rest
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, extractFromUrlStream: vi.fn() };
});

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onExtracted: vi.fn(),
};

afterEach(() => {
  vi.mocked(extractFromUrlStream).mockReset();
  vi.mocked(defaultProps.onClose).mockReset();
  vi.mocked(defaultProps.onExtracted).mockReset();
});

// Helper: mock SSE done
function mockDone(name: string, imageUrl: string | null) {
  vi.mocked(extractFromUrlStream).mockImplementation(
    async (_url, _onProgress, onDone) => {
      onDone({ name, imageUrl });
    },
  );
}

// Helper: mock SSE error
function mockError(err: ExtractFromUrlError) {
  vi.mocked(extractFromUrlStream).mockImplementation(
    async (_url, _onProgress, _onDone, onError) => {
      onError(err);
    },
  );
}

// Helper: mock progress steps then done
function mockProgressThenDone(
  steps: Array<{ step: string; message: string }>,
  name: string,
  imageUrl: string | null,
) {
  vi.mocked(extractFromUrlStream).mockImplementation(
    async (_url, onProgress, onDone) => {
      for (const s of steps) {
        onProgress({
          step: s.step as
            | "fetching"
            | "fetching_jina"
            | "extracting"
            | "generating_candidates",
          message: s.message,
        });
      }
      onDone({ name, imageUrl });
    },
  );
}

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

  it("URL を入力して送信するとストリーミング中にステップリストが表示される", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrlStream).mockReturnValue(new Promise(() => {}));

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    expect(extractFromUrlStream).toHaveBeenCalledWith(
      "https://example.com",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      undefined,
      undefined,
    );
    expect(screen.getByText("ページを取得中...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "抽出" })).toBeDisabled();
  });

  it("ステップが done になると ✓ が表示され active ステップはスピナーが表示される", async () => {
    const user = userEvent.setup();
    mockProgressThenDone(
      [
        { step: "fetching", message: "ページを取得中..." },
        { step: "extracting", message: "商品情報を解析中..." },
      ],
      "テスト商品",
      null,
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

    await waitFor(() => {
      expect(onExtracted).toHaveBeenCalled();
    });
  });

  it("fetching_jina ステップが動的に追加される", async () => {
    const user = userEvent.setup();
    // Never resolves — keep streaming state visible after progress
    let resolveStream!: () => void;
    vi.mocked(extractFromUrlStream).mockImplementation(
      (_url, onProgress) =>
        new Promise<void>((resolve) => {
          resolveStream = resolve;
          onProgress({ step: "fetching", message: "ページを取得中..." });
          onProgress({
            step: "fetching_jina",
            message: "別の方法でページを取得中...",
          });
        }),
    );

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    await waitFor(() => {
      expect(
        screen.getByText("別の方法でページを取得中..."),
      ).toBeInTheDocument();
    });
    resolveStream?.();
  });

  it("抽出成功で onExtracted(name, imageUrl, sourceUrl) が呼ばれる", async () => {
    const user = userEvent.setup();
    mockDone("テスト商品", "https://example.com/img.jpg");
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
        "https://example.com",
      );
    });
  });

  it("accessToken と activeGroupId が extractFromUrlStream に渡される", async () => {
    const user = userEvent.setup();
    mockDone("商品", null);

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
      expect(extractFromUrlStream).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        "token-abc",
        "group-xyz",
      );
    });
  });

  it("fetchFailed エラーで「ページを取得できませんでした」が表示される", async () => {
    const user = userEvent.setup();
    mockError(new ExtractFromUrlError("fetchFailed"));

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

  it("extractionFailed エラーで「商品情報を取得できませんでした」と「手動で入力する」ボタンが表示される", async () => {
    const user = userEvent.setup();
    mockError(new ExtractFromUrlError("extractionFailed"));
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
    expect(onExtracted).toHaveBeenCalledWith("", null, "https://example.com");
  });

  it("badRequest エラーで「有効な URL を入力してください」が表示される（再試行ボタンなし）", async () => {
    const user = userEvent.setup();
    mockError(new ExtractFromUrlError("badRequest"));

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.invalid",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    expect(
      await screen.findByText("有効な URL を入力してください"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "再試行" }),
    ).not.toBeInTheDocument();
  });

  it("unknown エラーで「エラーが発生しました」と「再試行」ボタンが表示される", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrlStream).mockImplementation(
      async (_url, _onProgress, _onDone, onError) => {
        onError(new ExtractFromUrlError("unknown", "unexpected"));
      },
    );

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    expect(await screen.findByText("エラーが発生しました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("再試行ボタンをクリックすると extractFromUrlStream が再呼び出しされる", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrlStream)
      .mockImplementationOnce(async (_url, _onProgress, _onDone, onError) => {
        onError(new ExtractFromUrlError("fetchFailed"));
      })
      .mockImplementationOnce(async (_url, _onProgress, onDone) => {
        onDone({ name: "再試行成功商品", imageUrl: null });
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
      expect(onExtracted).toHaveBeenCalledWith(
        "再試行成功商品",
        null,
        "https://example.com",
      );
    });
    expect(extractFromUrlStream).toHaveBeenCalledTimes(2);
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

  it("fetchFailed エラーで detail がある場合「詳細を表示」ボタンが表示される", async () => {
    const user = userEvent.setup();
    const errWithDetail = new ExtractFromUrlError("fetchFailed");
    errWithDetail.detail = "step1: connection refused; jina: HTTP 429";
    mockError(errWithDetail);

    render(<UrlRegistrationModal {...defaultProps} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    await screen.findByText("ページを取得できませんでした");
    const detailBtn = screen.getByRole("button", { name: "詳細を表示" });
    expect(detailBtn).toBeInTheDocument();

    await user.click(detailBtn);
    expect(
      screen.getByText("step1: connection refused; jina: HTTP 429"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "詳細を隠す" }),
    ).toBeInTheDocument();
  });

  it("candidates があるとき nameSelection 状態で候補ボタンが表示される", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrlStream).mockImplementation(
      async (_url, _onProgress, onDone) => {
        onDone({
          name: "とても長い商品名のサンプルテキストです",
          imageUrl: "https://example.com/img.jpg",
          nameCandidates: ["商品A", "商品B", "商品C"],
        });
      },
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

    await waitFor(() => {
      expect(screen.getByText("商品名を選択してください")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "商品A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "商品B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "商品C" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "とても長い商品名のサンプルテキストです（元の名前）",
      }),
    ).toBeInTheDocument();
    expect(onExtracted).not.toHaveBeenCalled();
  });

  it("候補ボタンをクリックすると onExtracted が候補名で呼ばれる", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrlStream).mockImplementation(
      async (_url, _onProgress, onDone) => {
        onDone({
          name: "とても長い商品名のサンプルテキストです",
          imageUrl: "https://example.com/img.jpg",
          nameCandidates: ["商品A", "商品B"],
        });
      },
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

    await screen.findByText("商品名を選択してください");
    await user.click(screen.getByRole("button", { name: "商品A" }));

    expect(onExtracted).toHaveBeenCalledWith(
      "商品A",
      "https://example.com/img.jpg",
      "https://example.com",
    );
  });

  it("元の名前ボタンをクリックすると onExtracted が元の名前で呼ばれる", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrlStream).mockImplementation(
      async (_url, _onProgress, onDone) => {
        onDone({
          name: "とても長い商品名のサンプルテキストです",
          imageUrl: null,
          nameCandidates: ["商品A"],
        });
      },
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

    await screen.findByText("商品名を選択してください");
    await user.click(
      screen.getByRole("button", {
        name: "とても長い商品名のサンプルテキストです（元の名前）",
      }),
    );

    expect(onExtracted).toHaveBeenCalledWith(
      "とても長い商品名のサンプルテキストです",
      null,
      "https://example.com",
    );
  });

  it("nameSelection 状態でキャンセルボタンをクリックすると onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    vi.mocked(extractFromUrlStream).mockImplementation(
      async (_url, _onProgress, onDone) => {
        onDone({
          name: "とても長い商品名のサンプルテキストです",
          imageUrl: null,
          nameCandidates: ["候補X"],
        });
      },
    );
    const onClose = vi.fn();

    render(<UrlRegistrationModal {...defaultProps} onClose={onClose} />);
    await user.type(
      screen.getByLabelText("商品ページの URL"),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "抽出" }));

    await screen.findByText("商品名を選択してください");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onClose).toHaveBeenCalled();
  });

  // Scenario: J-3-3
  it("progress イベントの後に onDone が発火されると <ol> が表示された状態から onExtracted が呼ばれる", async () => {
    const user = userEvent.setup();
    mockProgressThenDone(
      [
        { step: "fetching", message: "ページを取得中..." },
        { step: "extracting", message: "商品情報を解析中..." },
      ],
      "ストリーミング完了商品",
      "https://example.com/img.png",
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

    // streaming 中（ol が表示されている）ことを確認してから onExtracted が呼ばれる
    await waitFor(() => {
      expect(screen.getByRole("list")).toBeInTheDocument();
      expect(onExtracted).toHaveBeenCalledWith(
        "ストリーミング完了商品",
        "https://example.com/img.png",
        "https://example.com",
      );
    });
  });

  it("モーダルを閉じて再度開くと入力と状態がリセットされる", async () => {
    const user = userEvent.setup();
    mockError(new ExtractFromUrlError("fetchFailed"));

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
