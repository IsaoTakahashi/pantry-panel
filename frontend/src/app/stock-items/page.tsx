"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import CreateItemModal from "@/components/CreateItemModal";
import EditItemModal from "@/components/EditItemModal";
import FilterBar from "@/components/FilterBar";
import GroupSwitcher from "@/components/GroupSwitcher";
import ImageSelectionModal from "@/components/ImageSelectionModal";
import ItemCard from "@/components/ItemCard";
import ItemCardSimple from "@/components/ItemCardSimple";
import { useAuth } from "@/contexts/AuthContext";
import {
  createStockItem,
  deleteStockItem,
  fetchStockItems,
  updateStockItem,
} from "@/lib/api";
import { createGroup, updateGroupName } from "@/lib/authApi";
import { type FilterCondition, filterStockItems } from "@/lib/filterStockItems";
import { useStockItemsRealtime } from "@/lib/useStockItemsRealtime";
import type { StockItem } from "@/types/stockItem";

export default function StockItemsPage() {
  const {
    session,
    group,
    groups,
    switchGroup,
    signOut,
    loading: authLoading,
    refreshGroup,
  } = useAuth();
  const accessToken = session?.access_token;
  const activeGroupId = group?.groupId;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [imageEditingItem, setImageEditingItem] = useState<StockItem | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterCondition>({
    searchText: "",
    wantToBuyOnly: false,
    category: null,
  });
  const [viewMode, setViewMode] = useState<"normal" | "simple">("normal");

  const filteredItems = useMemo(
    () => filterStockItems(items, filter),
    [items, filter],
  );

  const Card = viewMode === "simple" ? ItemCardSimple : ItemCard;

  const handleCreate = async (
    name: string,
    category: string,
    wantToBuy: boolean,
  ) => {
    await createStockItem(
      { name, category, wantToBuy },
      accessToken,
      activeGroupId,
    );
    const data = await fetchStockItems(accessToken, activeGroupId);
    setItems(data);
  };

  const handleOpenEdit = (item: StockItem) => {
    setEditingItem(item);
  };

  const handleCloseEdit = () => {
    setEditingItem(null);
  };

  const handleSave = async (name: string, category: string) => {
    if (!editingItem) return;
    await updateStockItem(
      editingItem.id,
      { name, category },
      accessToken,
      activeGroupId,
    );
    const data = await fetchStockItems(accessToken, activeGroupId);
    setItems(data);
  };

  const handleToggleWantToBuy = async (item: StockItem) => {
    await updateStockItem(
      item.id,
      { wantToBuy: !item.wantToBuy },
      accessToken,
      activeGroupId,
    );
    const data = await fetchStockItems(accessToken, activeGroupId);
    setItems(data);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("この商品を削除しますか？")) return;
    await deleteStockItem(id, accessToken, activeGroupId);
    const data = await fetchStockItems(accessToken, activeGroupId);
    setItems(data);
  };

  const handleOpenImageEdit = (item: StockItem) => {
    setImageEditingItem(item);
  };

  const handleImageSelect = async (imageUrl: string | null) => {
    if (!imageEditingItem) return;
    await updateStockItem(
      imageEditingItem.id,
      { imageUrl },
      accessToken,
      activeGroupId,
    );
    setImageEditingItem(null);
    const data = await fetchStockItems(accessToken, activeGroupId);
    setItems(data);
  };

  const handleRenameGroup = async (groupId: string, name: string) => {
    if (!accessToken || !activeGroupId) return;
    await updateGroupName(groupId, name, accessToken, activeGroupId);
    await refreshGroup();
  };

  const handleCreateNewGroup = async (name: string) => {
    if (!accessToken) return;
    await createGroup(name, accessToken);
    await refreshGroup();
  };

  const handleRealtimeChange = useCallback(() => {
    fetchStockItems(accessToken, activeGroupId)
      .then((data) => setItems(data))
      .catch(() => {});
  }, [accessToken, activeGroupId]);

  useStockItemsRealtime(handleRealtimeChange);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setError(null);
    fetchStockItems(accessToken, activeGroupId)
      .then((data) => setItems(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unknown error"),
      )
      .finally(() => setLoading(false));
  }, [authLoading, accessToken, activeGroupId]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb] text-white py-2 px-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <h1 className="text-2xl font-bold">Pantry Panel</h1>
            <div className="flex items-center gap-3 text-sm">
              <GroupSwitcher
                groups={groups}
                activeGroup={group}
                onSwitch={switchGroup}
                onCreateGroup={handleCreateNewGroup}
                onRenameGroup={handleRenameGroup}
              />
              {group?.role === "owner" && (
                <a
                  href="/invite"
                  className="opacity-80 hover:opacity-100 underline"
                >
                  招待
                </a>
              )}
              <button
                type="button"
                onClick={() => signOut()}
                className="opacity-80 hover:opacity-100"
              >
                サインアウト
              </button>
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-4">
          {loading ? (
            <p className="text-center py-12 text-gray-600">Loading...</p>
          ) : error ? (
            <p className="text-center py-12 text-red-600">
              商品を取得できませんでした
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <FilterBar
                  value={filter}
                  onChange={setFilter}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                />
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium md:self-start"
                >
                  商品を追加
                </button>
              </div>
              <CreateItemModal
                isOpen={isModalOpen}
                initialName={filter.searchText}
                initialCategory={filter.category ?? "★"}
                initialWantToBuy={filter.wantToBuyOnly}
                onClose={() => setIsModalOpen(false)}
                onCreate={handleCreate}
              />
              <EditItemModal
                item={editingItem}
                isOpen={!!editingItem}
                onClose={handleCloseEdit}
                onSave={handleSave}
              />
              <ImageSelectionModal
                item={
                  imageEditingItem ?? {
                    id: "",
                    name: "",
                    category: "",
                    imageUrl: null,
                    wantToBuy: false,
                    createdAt: "",
                    updatedAt: "",
                    sortedAt: "",
                  }
                }
                isOpen={!!imageEditingItem}
                onClose={() => setImageEditingItem(null)}
                onSelect={handleImageSelect}
                accessToken={accessToken}
                activeGroupId={activeGroupId}
              />
              {items.length === 0 ? (
                <p className="text-center py-12 text-gray-600">
                  商品がありません
                </p>
              ) : filteredItems.length === 0 ? (
                <p className="text-center py-12 text-gray-600">
                  該当する商品がありません
                </p>
              ) : (
                <motion.div
                  layout
                  className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 ${viewMode === "simple" ? "gap-1.5" : "gap-3"}`}
                >
                  <AnimatePresence mode="popLayout">
                    {filteredItems.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.5 }}
                      >
                        <Card
                          item={item}
                          onDelete={handleDelete}
                          onEdit={handleOpenEdit}
                          onToggleWantToBuy={handleToggleWantToBuy}
                          onImageEdit={handleOpenImageEdit}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
