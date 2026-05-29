import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStockItem,
  deleteStockItem,
  fetchStockItems,
  updateStockItem,
} from "@/lib/api";
import { createGroup, updateGroupName } from "@/lib/authApi";
import { useStockItemsRealtime } from "@/lib/useStockItemsRealtime";
import { useStockItems } from "./useStockItems";

vi.mock("@/lib/api");
vi.mock("@/lib/authApi");
vi.mock("@/lib/useStockItemsRealtime");

const mockItems = [
  {
    id: "1",
    name: "醤油",
    category: "調味料",
    imageUrl: null,
    sourceUrl: null,
    wantToBuy: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    sortedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "2",
    name: "味噌",
    category: "調味料",
    imageUrl: null,
    sourceUrl: null,
    wantToBuy: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    sortedAt: "2026-01-01T00:00:00Z",
  },
];

const defaultArgs: Parameters<typeof useStockItems> = [
  "test-token",
  "group-1",
  vi.fn(),
  false,
];

afterEach(() => {
  vi.clearAllMocks();
});

describe("useStockItems", () => {
  describe("初期状態", () => {
    it("初期 state が正しく設定される", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

      const { result } = renderHook(() => useStockItems(...defaultArgs));

      expect(result.current.items).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.isModalOpen).toBe(false);
      expect(result.current.urlModalOpen).toBe(false);
      expect(result.current.editingItem).toBeNull();
      expect(result.current.imageEditingItem).toBeNull();
      expect(result.current.confirmDeleteItem).toBeNull();
    });

    it("fetchStockItems が成功すると items が更新され loading: false になる", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

      const { result } = renderHook(() => useStockItems(...defaultArgs));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.items).toEqual(mockItems);
      expect(result.current.error).toBeNull();
    });

    it("fetchStockItems が失敗すると error がセットされ loading: false になる", async () => {
      vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));

      const { result } = renderHook(() => useStockItems(...defaultArgs));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("HTTP 500");
      expect(result.current.items).toEqual([]);
    });

    it("authLoading が true のときは fetchStockItems が呼ばれない", () => {
      const { result } = renderHook(() =>
        useStockItems("test-token", "group-1", vi.fn(), true),
      );

      expect(fetchStockItems).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    });
  });

  describe("handleCreate", () => {
    it("handleCreate が成功すると items が更新され error が null になる", async () => {
      const createdItem = { ...mockItems[0], id: "3", name: "塩" };
      vi.mocked(fetchStockItems)
        .mockResolvedValueOnce(mockItems)
        .mockResolvedValueOnce([...mockItems, createdItem]);
      vi.mocked(createStockItem).mockResolvedValue(createdItem);

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleCreate("塩", "調味料", false, null, null);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.items).toHaveLength(3);
    });

    it("handleCreate が API エラーで error をセットする", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(createStockItem).mockRejectedValue(
        new Error("商品の追加に失敗しました"),
      );

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleCreate("塩", "調味料", false, null, null);
      });

      expect(result.current.error).toBe("商品の追加に失敗しました");
      expect(result.current.items).toEqual(mockItems);
    });
  });

  describe("handleToggleWantToBuy", () => {
    it("handleToggleWantToBuy が API エラーで楽観的更新を戻す", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(updateStockItem).mockRejectedValue(
        new Error("更新に失敗しました"),
      );

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const itemsBefore = result.current.items;

      await act(async () => {
        await result.current.handleToggleWantToBuy(mockItems[0]);
      });

      // 楽観的更新が元に戻る
      expect(result.current.items).toEqual(itemsBefore);
      expect(result.current.error).toBe("更新に失敗しました");
    });

    it("handleToggleWantToBuy が成功すると error が null になる", async () => {
      const toggledItem = { ...mockItems[0], wantToBuy: true };
      vi.mocked(fetchStockItems)
        .mockResolvedValueOnce(mockItems)
        .mockResolvedValueOnce([toggledItem, mockItems[1]]);
      vi.mocked(updateStockItem).mockResolvedValue(toggledItem);

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleToggleWantToBuy(mockItems[0]);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("handleDelete と handleConfirmDelete", () => {
    it("handleDelete を呼ぶと confirmDeleteItem がセットされる", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.handleDelete(mockItems[0]);
      });

      expect(result.current.confirmDeleteItem).toEqual(mockItems[0]);
      expect(deleteStockItem).not.toHaveBeenCalled();
    });

    it("handleConfirmDelete が成功すると confirmDeleteItem が null にリセットされ items が更新される", async () => {
      vi.mocked(fetchStockItems)
        .mockResolvedValueOnce(mockItems)
        .mockResolvedValueOnce([mockItems[1]]);
      vi.mocked(deleteStockItem).mockResolvedValue(undefined);

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.handleDelete(mockItems[0]);
      });
      expect(result.current.confirmDeleteItem).toEqual(mockItems[0]);

      await act(async () => {
        await result.current.handleConfirmDelete();
      });

      expect(result.current.confirmDeleteItem).toBeNull();
      expect(result.current.items).toEqual([mockItems[1]]);
      expect(result.current.error).toBeNull();
    });

    it("handleConfirmDelete が API エラーで error をセットする", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(deleteStockItem).mockRejectedValue(
        new Error("削除に失敗しました"),
      );

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.handleDelete(mockItems[0]);
      });

      await act(async () => {
        await result.current.handleConfirmDelete();
      });

      expect(result.current.error).toBe("削除に失敗しました");
    });
  });

  describe("handleSave", () => {
    it("handleSave が API エラーで error をセットする", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(updateStockItem).mockRejectedValue(
        new Error("保存に失敗しました"),
      );

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.handleOpenEdit(mockItems[0]);
      });

      await act(async () => {
        await result.current.handleSave("濃口醤油", "調味料");
      });

      expect(result.current.error).toBe("保存に失敗しました");
    });
  });

  describe("handleImageSelect", () => {
    it("handleImageSelect が API エラーで error をセットする", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(updateStockItem).mockRejectedValue(
        new Error("画像の更新に失敗しました"),
      );

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.handleOpenImageEdit(mockItems[0]);
      });

      await act(async () => {
        await result.current.handleImageSelect("https://example.com/image.jpg");
      });

      expect(result.current.error).toBe("画像の更新に失敗しました");
    });
  });

  describe("handleRenameGroup", () => {
    it("handleRenameGroup が API エラーで error をセットする", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(updateGroupName).mockRejectedValue(
        new Error("グループ名の更新に失敗しました"),
      );

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleRenameGroup("group-1", "新しい名前");
      });

      expect(result.current.error).toBe("グループ名の更新に失敗しました");
    });
  });

  describe("handleCreateNewGroup", () => {
    it("handleCreateNewGroup が API エラーで error をセットする", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(createGroup).mockRejectedValue(
        new Error("グループの作成に失敗しました"),
      );

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleCreateNewGroup("新しいグループ");
      });

      expect(result.current.error).toBe("グループの作成に失敗しました");
    });
  });

  describe("useStockItemsRealtime", () => {
    it("Realtime 通知で fetchStockItems が再取得される", async () => {
      vi.mocked(fetchStockItems)
        .mockResolvedValueOnce(mockItems)
        .mockResolvedValueOnce(mockItems);

      let captureOnChange: (() => void) | undefined;
      vi.mocked(useStockItemsRealtime).mockImplementation((cb) => {
        captureOnChange = cb;
      });

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callsBefore = vi.mocked(fetchStockItems).mock.calls.length;

      act(() => {
        captureOnChange?.();
      });

      await waitFor(() => {
        expect(fetchStockItems).toHaveBeenCalledTimes(callsBefore + 1);
      });
    });
  });
});
