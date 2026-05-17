import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageSearchError, searchImages } from "@/lib/api";
import type { StockItem } from "@/types/stockItem";
import ImageSelectionModal from "./ImageSelectionModal";

// vi.spyOn は ESM named export をコンポーネント側でインターセプトできないため vi.mock を使用
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, searchImages: vi.fn() };
});

const item: StockItem = {
  id: "1",
  name: "りんご",
  category: "★",
  imageUrl: null,
  wantToBuy: false,
  createdAt: "",
  updatedAt: "",
  sortedAt: "",
};

afterEach(() => {
  vi.mocked(searchImages).mockReset();
});

describe("ImageSelectionModal", () => {
  it("open 時に item.name で自動検索を発火する", async () => {
    vi.mocked(searchImages).mockResolvedValue([
      {
        imageUrl: "https://x/a.jpg",
        thumbnailUrl: "https://x/a-t.jpg",
        title: "A",
      },
    ]);

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() =>
      expect(searchImages).toHaveBeenCalledWith("りんご", expect.any(Number)),
    );
    expect(await screen.findByAltText("A")).toBeInTheDocument();
  });

  it("結果クリックで onSelect(imageUrl) を呼ぶ", async () => {
    vi.mocked(searchImages).mockResolvedValue([
      {
        imageUrl: "https://x/a.jpg",
        thumbnailUrl: "https://x/a-t.jpg",
        title: "A",
      },
    ]);
    const onSelect = vi.fn();

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={() => {}}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(await screen.findByAltText("A"));
    expect(onSelect).toHaveBeenCalledWith("https://x/a.jpg");
  });

  it("item.imageUrl が非 null のときのみ「画像を解除」を表示し、クリックで onSelect(null) を呼ぶ", async () => {
    vi.mocked(searchImages).mockResolvedValue([]);
    const onSelect = vi.fn();
    const withImage = { ...item, imageUrl: "https://x/a.jpg" };

    render(
      <ImageSelectionModal
        item={withImage}
        isOpen
        onClose={() => {}}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /画像を解除/ }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("item.imageUrl が null のときは「画像を解除」を表示しない", async () => {
    vi.mocked(searchImages).mockResolvedValue([]);

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() => expect(searchImages).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: /画像を解除/ }),
    ).not.toBeInTheDocument();
  });

  it("検索結果が 0 件のとき「画像が見つかりませんでした」を表示する", async () => {
    vi.mocked(searchImages).mockResolvedValue([]);

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(
      await screen.findByText(/画像が見つかりませんでした/),
    ).toBeInTheDocument();
  });

  it("quota エラーで「本日の検索上限」メッセージを表示する", async () => {
    vi.mocked(searchImages).mockRejectedValue(new ImageSearchError("quota"));

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(await screen.findByText(/本日の検索上限/)).toBeInTheDocument();
  });

  it("一般エラーで「画像検索に失敗しました」と再試行ボタンを表示し、再試行で再検索する", async () => {
    vi.mocked(searchImages).mockRejectedValueOnce(
      new ImageSearchError("upstream"),
    );

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(
      await screen.findByText(/画像検索に失敗しました/),
    ).toBeInTheDocument();

    vi.mocked(searchImages).mockResolvedValueOnce([
      {
        imageUrl: "https://x/b.jpg",
        thumbnailUrl: "https://x/b-t.jpg",
        title: "B",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /再試行/ }));
    expect(await screen.findByAltText("B")).toBeInTheDocument();
  });

  it("Escape キーで onClose が呼ばれる", async () => {
    vi.mocked(searchImages).mockResolvedValue([]);
    const onClose = vi.fn();

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={onClose}
        onSelect={() => {}}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("キャンセルボタンで onClose が呼ばれる", async () => {
    vi.mocked(searchImages).mockResolvedValue([]);
    const onClose = vi.fn();

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={onClose}
        onSelect={() => {}}
      />,
    );

    await waitFor(() => expect(searchImages).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /キャンセル/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it("検索ボックスを変更して検索ボタンを押すと再検索される", async () => {
    vi.mocked(searchImages).mockResolvedValue([]);

    render(
      <ImageSelectionModal
        item={item}
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() => expect(searchImages).toHaveBeenCalled());
    vi.mocked(searchImages).mockClear();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "もも" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^検索$/ }));
    await waitFor(() =>
      expect(searchImages).toHaveBeenCalledWith("もも", expect.any(Number)),
    );
  });
});
