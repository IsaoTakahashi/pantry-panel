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

// defaultArgs は effectiveGroupId が確定値であるケースを表す（isGroupConfirmed: true）
const defaultArgs: Parameters<typeof useStockItems> = [
  "test-token",
  "group-1",
  vi.fn(),
  true,
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

    it("確定 groupId でのフェッチが失敗すると error がセットされ loading: false になる", async () => {
      vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));

      const { result } = renderHook(() => useStockItems(...defaultArgs));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("HTTP 500");
      expect(result.current.items).toEqual([]);
    });

    it("effectiveGroupId が未定義のときは fetchStockItems が呼ばれない", () => {
      const { result } = renderHook(() =>
        useStockItems("test-token", undefined, vi.fn(), false),
      );

      expect(fetchStockItems).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    });
  });

  describe("推測 groupId による先行フェッチと確定後の整合", () => {
    it("推測groupIdでの先行フェッチが確定前に開始される", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

      const { result } = renderHook(() =>
        useStockItems("test-token", "speculative-group", vi.fn(), false),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(fetchStockItems).toHaveBeenCalledWith(
        "test-token",
        "speculative-group",
      );
      expect(result.current.items).toEqual(mockItems);
    });

    it("確定値が推測値と一致する場合は再フェッチしない", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);

      const { result, rerender } = renderHook(
        (props: Parameters<typeof useStockItems>) => useStockItems(...props),
        {
          initialProps: ["test-token", "group-1", vi.fn(), false] as Parameters<
            typeof useStockItems
          >,
        },
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(fetchStockItems).toHaveBeenCalledTimes(1);

      rerender(["test-token", "group-1", vi.fn(), true]);

      // 再フェッチが起きないことを確認（非同期の追加呼び出しが無いことを待って確認）
      await waitFor(() => {
        expect(fetchStockItems).toHaveBeenCalledTimes(1);
      });
      expect(result.current.items).toEqual(mockItems);
    });

    it("確定値が推測値と異なる場合は確定値で再フェッチする", async () => {
      const speculativeItems = [mockItems[0]];
      const confirmedItems = [mockItems[1]];
      vi.mocked(fetchStockItems)
        .mockResolvedValueOnce(speculativeItems)
        .mockResolvedValueOnce(confirmedItems);

      const { result, rerender } = renderHook(
        (props: Parameters<typeof useStockItems>) => useStockItems(...props),
        {
          initialProps: [
            "test-token",
            "speculative-group",
            vi.fn(),
            false,
          ] as Parameters<typeof useStockItems>,
        },
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.items).toEqual(speculativeItems);

      rerender(["test-token", "confirmed-group", vi.fn(), true]);

      await waitFor(() => {
        expect(result.current.items).toEqual(confirmedItems);
      });

      expect(fetchStockItems).toHaveBeenCalledTimes(2);
      expect(fetchStockItems).toHaveBeenNthCalledWith(
        2,
        "test-token",
        "confirmed-group",
      );
    });

    it("推測フェーズのフェッチ失敗はerrorに反映しない", async () => {
      vi.mocked(fetchStockItems).mockRejectedValue(new Error("403 Forbidden"));

      const { result } = renderHook(() =>
        useStockItems("test-token", "speculative-group", vi.fn(), false),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBeNull();
      expect(result.current.items).toEqual([]);
    });

    it("確定フェッチより先行フェッチの応答が遅れて返っても確定結果が優先される", async () => {
      const speculativeDeferred = deferred<typeof mockItems>();
      const confirmedDeferred = deferred<typeof mockItems>();
      const confirmedItems = [mockItems[1]];

      vi.mocked(fetchStockItems)
        .mockReturnValueOnce(speculativeDeferred.promise)
        .mockReturnValueOnce(confirmedDeferred.promise);

      const { result, rerender } = renderHook(
        (props: Parameters<typeof useStockItems>) => useStockItems(...props),
        {
          initialProps: [
            "test-token",
            "speculative-group",
            vi.fn(),
            false,
          ] as Parameters<typeof useStockItems>,
        },
      );

      // 推測フェッチが in-flight のうちに確定値へ切り替える
      rerender(["test-token", "confirmed-group", vi.fn(), true]);

      // 確定フェッチが先に解決する
      await act(async () => {
        confirmedDeferred.resolve(confirmedItems);
        await confirmedDeferred.promise;
      });

      await waitFor(() => expect(result.current.items).toEqual(confirmedItems));
      expect(result.current.loading).toBe(false);

      // 古い推測フェッチの応答が遅れて返る
      await act(async () => {
        speculativeDeferred.resolve([mockItems[0]]);
        await speculativeDeferred.promise;
      });

      // 古い応答は items/error state に反映されない
      expect(result.current.items).toEqual(confirmedItems);
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
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

    it("handleCreate が API エラーを caller に re-throw する（ページレベル error はセットしない）", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(createStockItem).mockRejectedValue(
        new Error("商品の追加に失敗しました"),
      );

      const { result } = renderHook(() => useStockItems(...defaultArgs));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await expect(
          result.current.handleCreate("塩", "調味料", false, null, null),
        ).rejects.toThrow("商品の追加に失敗しました");
      });

      // ページレベルエラー state は変更されない。モーダル側がエラーを表示する責務を持つ
      expect(result.current.error).toBeNull();
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

    it("handleConfirmDelete が API エラーで confirmDeleteItem を null にリセットする", async () => {
      vi.mocked(fetchStockItems).mockResolvedValue(mockItems);
      vi.mocked(deleteStockItem).mockRejectedValue(
        new Error("削除に失敗しました"),
      );

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
