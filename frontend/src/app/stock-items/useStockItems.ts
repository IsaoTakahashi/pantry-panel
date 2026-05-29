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
  activeGroupId: string | undefined,
  refreshGroup: () => Promise<void>,
  authLoading: boolean,
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

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setError(null);
    fetchStockItems(accessToken, activeGroupId)
      .then((data) => setItems(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "操作に失敗しました"),
      )
      .finally(() => setLoading(false));
  }, [authLoading, accessToken, activeGroupId]);

  const handleRealtimeChange = useCallback(() => {
    fetchStockItems(accessToken, activeGroupId)
      .then((data) => setItems(data))
      .catch(() => {});
  }, [accessToken, activeGroupId]);

  useStockItemsRealtime(handleRealtimeChange);

  const handleCreate = async (
    name: string,
    category: string,
    wantToBuy: boolean,
    imageUrl: string | null,
    sourceUrl: string | null,
  ): Promise<void> => {
    try {
      const created = await createStockItem(
        { name, category, wantToBuy, sourceUrl: sourceUrl ?? undefined },
        accessToken,
        activeGroupId,
      );
      if (imageUrl) {
        await updateStockItem(
          created.id,
          { imageUrl },
          accessToken,
          activeGroupId,
        );
      }
      const data = await fetchStockItems(accessToken, activeGroupId);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    }
  };

  const handleSave = async (name: string, category: string): Promise<void> => {
    if (!editingItem) return;
    try {
      await updateStockItem(
        editingItem.id,
        { name, category },
        accessToken,
        activeGroupId,
      );
      const data = await fetchStockItems(accessToken, activeGroupId);
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
        activeGroupId,
      );
      const data = await fetchStockItems(accessToken, activeGroupId);
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
      await deleteStockItem(confirmDeleteItem.id, accessToken, activeGroupId);
      setConfirmDeleteItem(null);
      const data = await fetchStockItems(accessToken, activeGroupId);
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
        activeGroupId,
      );
      setImageEditingItem(null);
      const data = await fetchStockItems(accessToken, activeGroupId);
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
    if (!accessToken || !activeGroupId) return;
    try {
      await updateGroupName(groupId, name, accessToken, activeGroupId);
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
