"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MdLink, MdLogout } from "react-icons/md";
import AuthGuard from "@/components/AuthGuard";
import CreateItemModal from "@/components/CreateItemModal";
import EditItemModal from "@/components/EditItemModal";
import FilterBar from "@/components/FilterBar";
import GroupSwitcher from "@/components/GroupSwitcher";
import ImageSelectionModal from "@/components/ImageSelectionModal";
import ItemCard from "@/components/ItemCard";
import ItemCardSimple from "@/components/ItemCardSimple";
import UrlRegistrationModal from "@/components/UrlRegistrationModal";
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

export default function StockItemsClient() {
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
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<{
    name: string;
    imageUrl: string | null;
    sourceUrl: string | null;
  }>({ name: "", imageUrl: null, sourceUrl: null });
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
    imageUrl: string | null,
    sourceUrl: string | null,
  ) => {
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
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, wantToBuy: !item.wantToBuy } : i,
      ),
    );
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

  function handleExtracted(
    name: string,
    imageUrl: string | null,
    sourceUrl: string,
  ) {
    setUrlModalOpen(false);
    setPrefill({ name, imageUrl, sourceUrl });
    setIsModalOpen(true);
  }

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
                  className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-sm text-white no-underline"
                >
                  <MdLink aria-hidden size={16} />
                  招待
                </a>
              )}
              <button
                type="button"
                onClick={() => signOut()}
                title="サインアウト"
                aria-label="サインアウト"
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-white border-0 cursor-pointer"
              >
                <MdLogout aria-hidden size={18} />
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
                <div className="flex w-full items-center gap-2 md:w-auto md:self-start">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="flex-1 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium md:flex-none"
                  >
                    商品を追加
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrlModalOpen(true)}
                    aria-label="URLから追加"
                    className="shrink-0 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-3 py-2.5 rounded font-medium"
                  >
                    <MdLink aria-hidden size={20} />
                  </button>
                </div>
              </div>
              <CreateItemModal
                isOpen={isModalOpen}
                initialName={prefill.name || filter.searchText}
                initialCategory={filter.category ?? "★"}
                initialWantToBuy={filter.wantToBuyOnly}
                initialImageUrl={prefill.imageUrl}
                initialSourceUrl={prefill.sourceUrl}
                onClose={() => {
                  setIsModalOpen(false);
                  setPrefill({ name: "", imageUrl: null, sourceUrl: null });
                }}
                onCreate={handleCreate}
              />
              <UrlRegistrationModal
                isOpen={urlModalOpen}
                onClose={() => setUrlModalOpen(false)}
                onExtracted={handleExtracted}
                accessToken={accessToken}
                activeGroupId={activeGroupId}
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
                    sourceUrl: null,
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
