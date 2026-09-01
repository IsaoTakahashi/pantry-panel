import { useCallback, useEffect, useState } from "react";
import {
  createStockItem,
  deleteStockItem,
  fetchStockItems,
  updateStockItem,
} from "@/lib/api";
import { createGroup, updateGroupName } from "@/lib/authApi";
import { useStockItemsRealtime } from "@/lib/useStockItemsRealtime";
import type { StockItem } from "@/types/stockItem";

type Prefill = {
  name: string;
  imageUrl: string | null;
  sourceUrl: string | null;
};

type UseStockItemsReturn = {
  items: StockItem[];
  loading: boolean;
  error: string | null;
  isModalOpen: boolean;
  urlModalOpen: boolean;
  prefill: Prefill;
  editingItem: StockItem | null;
  imageEditingItem: StockItem | null;
  confirmDeleteItem: StockItem | null;
  handleCreate: (
    name: string,
    category: string,
    wantToBuy: boolean,
    imageUrl: string | null,
    sourceUrl: string | null,
  ) => Promise<void>;
  handleSave: (name: string, category: string) => Promise<void>;
  handleToggleWantToBuy: (item: StockItem) => Promise<void>;
  handleDelete: (item: StockItem) => void;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => Promise<void>;
  handleOpenEdit: (item: StockItem) => void;
  handleCloseEdit: () => void;
  handleOpenImageEdit: (item: StockItem) => void;
  handleCloseImageEdit: () => void;
  handleImageSelect: (imageUrl: string | null) => Promise<void>;
  handleRenameGroup: (groupId: string, name: string) => Promise<void>;
  handleCreateNewGroup: (name: string) => Promise<void>;
  handleExtracted: (
    name: string,
    imageUrl: string | null,
    sourceUrl: string,
  ) => void;
  handleCloseCreateModal: () => void;
  setIsModalOpen: (open: boolean) => void;
  setUrlModalOpen: (open: boolean) => void;
};

export function useStockItems(
  accessToken: string | undefined,
  effectiveGroupId: string | undefined,
  refreshGroup: () => Promise<void>,
  isGroupConfirmed: boolean,
): UseStockItemsReturn {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill>({
    name: "",
    imageUrl: null,
    sourceUrl: null,
  });
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [imageEditingItem, setImageEditingItem] = useState<StockItem | null>(
    null,
  );
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<StockItem | null>(
    null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: isGroupConfirmed is intentionally excluded from deps — this effect must react only to effectiveGroupId/accessToken changes (Decision 2). wasConfirmedAtFetchStart below still reads the current isGroupConfirmed via closure, captured from whichever render actually triggered this effect run.
  useEffect(() => {
    // effectiveGroupId が無ければ fetch しない（確定値も推測値も無い初回ログイン等）。
    // 値がある場合は確定/推測を問わずただちに fetch する。推測値→確定値のように
    // effectiveGroupId 自体が変化すれば依存配列の変化で自動的に再フェッチされ、
    // 変化しなければ（推測値=確定値）React が自動的に再実行をスキップする。
    if (!effectiveGroupId) return;

    // このフェッチ実行時点での確定状態を捕捉する。後から確定しても、この実行の
    // catch 処理の挙動は変わらない（次に effectiveGroupId が変わって再実行される
    // まで待つ）。
    const wasConfirmedAtFetchStart = isGroupConfirmed;
    // 推測フェッチと確定フェッチが短時間に連続発火しうるため、ネットワーク応答が
    // 逆順で返ってきても新しい fetch の結果が古い fetch の結果に上書きされないよう
    // ガードする。
    let cancelled = false;

    setLoading(true);
    setError(null);
    fetchStockItems(accessToken, effectiveGroupId)
      .then((data) => {
        if (cancelled) return;
        setItems(data);
      })
      .catch((err) => {
        if (cancelled) return;
        // 推測フェーズ（未確定）のフェッチ失敗はユーザーに見せない。キャッシュされた
        // groupId が古い（脱退済み・別アカウントの残留キャッシュ）ことによる 403 等は
        // 実装の都合であり、確定フェッチの結果のみが正となる。
        if (wasConfirmedAtFetchStart) {
          setError(err instanceof Error ? err.message : "操作に失敗しました");
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, effectiveGroupId]);

  const handleRealtimeChange = useCallback(() => {
    fetchStockItems(accessToken, effectiveGroupId)
      .then((data) => setItems(data))
      .catch(() => {});
  }, [accessToken, effectiveGroupId]);

  useStockItemsRealtime(handleRealtimeChange);

  const handleCreate = async (
    name: string,
    category: string,
    wantToBuy: boolean,
    imageUrl: string | null,
    sourceUrl: string | null,
  ): Promise<void> => {
    const created = await createStockItem(
      { name, category, wantToBuy, sourceUrl: sourceUrl ?? undefined },
      accessToken,
      effectiveGroupId,
    );
    if (imageUrl) {
      await updateStockItem(
        created.id,
        { imageUrl },
        accessToken,
        effectiveGroupId,
      );
    }
    const data = await fetchStockItems(accessToken, effectiveGroupId);
    setItems(data);
  };

  const handleSave = async (name: string, category: string): Promise<void> => {
    if (!editingItem) return;
    try {
      await updateStockItem(
        editingItem.id,
        { name, category },
        accessToken,
        effectiveGroupId,
      );
      const data = await fetchStockItems(accessToken, effectiveGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleToggleWantToBuy = async (item: StockItem): Promise<void> => {
    const previousItems = [...items];
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, wantToBuy: !item.wantToBuy } : i,
      ),
    );
    try {
      await updateStockItem(
        item.id,
        { wantToBuy: !item.wantToBuy },
        accessToken,
        effectiveGroupId,
      );
      const data = await fetchStockItems(accessToken, effectiveGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setItems(previousItems);
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleDelete = (item: StockItem): void => {
    setConfirmDeleteItem(item);
  };

  const handleCancelDelete = (): void => {
    setConfirmDeleteItem(null);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!confirmDeleteItem) return;
    try {
      await deleteStockItem(
        confirmDeleteItem.id,
        accessToken,
        effectiveGroupId,
      );
      setConfirmDeleteItem(null);
      const data = await fetchStockItems(accessToken, effectiveGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setConfirmDeleteItem(null);
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleOpenEdit = (item: StockItem): void => {
    setEditingItem(item);
  };

  const handleCloseEdit = (): void => {
    setEditingItem(null);
  };

  const handleOpenImageEdit = (item: StockItem): void => {
    setImageEditingItem(item);
  };

  const handleImageSelect = async (imageUrl: string | null): Promise<void> => {
    if (!imageEditingItem) return;
    try {
      await updateStockItem(
        imageEditingItem.id,
        { imageUrl },
        accessToken,
        effectiveGroupId,
      );
      setImageEditingItem(null);
      const data = await fetchStockItems(accessToken, effectiveGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleRenameGroup = async (
    groupId: string,
    name: string,
  ): Promise<void> => {
    if (!accessToken || !effectiveGroupId) return;
    try {
      await updateGroupName(groupId, name, accessToken, effectiveGroupId);
      await refreshGroup();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleCreateNewGroup = async (name: string): Promise<void> => {
    if (!accessToken) return;
    try {
      await createGroup(name, accessToken);
      await refreshGroup();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleCloseCreateModal = (): void => {
    setIsModalOpen(false);
    setPrefill({ name: "", imageUrl: null, sourceUrl: null });
  };

  const handleCloseImageEdit = (): void => {
    setImageEditingItem(null);
  };

  const handleExtracted = (
    name: string,
    imageUrl: string | null,
    sourceUrl: string,
  ): void => {
    setUrlModalOpen(false);
    setPrefill({ name, imageUrl, sourceUrl });
    setIsModalOpen(true);
  };

  return {
    items,
    loading,
    error,
    isModalOpen,
    urlModalOpen,
    prefill,
    editingItem,
    imageEditingItem,
    confirmDeleteItem,
    handleCreate,
    handleSave,
    handleToggleWantToBuy,
    handleDelete,
    handleCancelDelete,
    handleConfirmDelete,
    handleOpenEdit,
    handleCloseEdit,
    handleOpenImageEdit,
    handleCloseImageEdit,
    handleImageSelect,
    handleRenameGroup,
    handleCreateNewGroup,
    handleExtracted,
    handleCloseCreateModal,
    setIsModalOpen,
    setUrlModalOpen,
  };
}
