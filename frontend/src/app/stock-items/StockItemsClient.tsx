"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { MdLink, MdLogout } from "react-icons/md";
import AuthGuard from "@/components/AuthGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import FilterBar from "@/components/FilterBar";
import GroupSwitcher from "@/components/GroupSwitcher";
import ItemCard from "@/components/ItemCard";
import ItemCardSimple from "@/components/ItemCardSimple";
import { useAuth } from "@/contexts/AuthContext";
import { type FilterCondition, filterStockItems } from "@/lib/filterStockItems";
import StockItemsSkeleton from "./StockItemsSkeleton";
import { useStockItems } from "./useStockItems";

const CreateItemModal = dynamic(() => import("@/components/CreateItemModal"), {
  ssr: false,
});
const EditItemModal = dynamic(() => import("@/components/EditItemModal"), {
  ssr: false,
});
const ImageSelectionModal = dynamic(
  () => import("@/components/ImageSelectionModal"),
  { ssr: false },
);
const UrlRegistrationModal = dynamic(
  () => import("@/components/UrlRegistrationModal"),
  { ssr: false },
);

const INITIAL_FILTER: FilterCondition = {
  searchText: "",
  wantToBuyOnly: false,
  category: null,
};

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

  const {
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
    handleImageSelect,
    handleRenameGroup,
    handleCreateNewGroup,
    handleExtracted,
    handleCloseCreateModal,
    handleCloseImageEdit,
    setIsModalOpen,
    setUrlModalOpen,
  } = useStockItems(accessToken, activeGroupId, refreshGroup, authLoading);

  const [filter, setFilter] = useState<FilterCondition>(INITIAL_FILTER);
  const [viewMode, setViewMode] = useState<"normal" | "simple">("normal");

  const filteredItems = useMemo(
    () => filterStockItems(items, filter),
    [items, filter],
  );

  const Card = viewMode === "simple" ? ItemCardSimple : ItemCard;

  const handleCreateAndResetFilter = async (
    name: string,
    category: string,
    wantToBuy: boolean,
    imageUrl: string | null,
    sourceUrl: string | null,
  ) => {
    await handleCreate(name, category, wantToBuy, imageUrl, sourceUrl);
    setFilter(INITIAL_FILTER);
  };

  if (authLoading) return <StockItemsSkeleton />;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-100 py-2 px-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d1b2] to-[#0d9488] flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-bold select-none">
                  P
                </span>
              </div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Pantry Panel
              </h1>
            </div>
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
                  className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-sm text-slate-500 no-underline"
                >
                  <MdLink aria-hidden size={16} />
                </a>
              )}
              <button
                type="button"
                onClick={() => signOut()}
                title="サインアウト"
                aria-label="サインアウト"
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500 border-0 cursor-pointer"
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
                    className="flex-1 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded-xl font-bold md:flex-none"
                  >
                    商品を追加
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrlModalOpen(true)}
                    aria-label="URLから追加"
                    className="shrink-0 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-3 py-2.5 rounded-xl font-bold"
                  >
                    <MdLink aria-hidden size={20} />
                  </button>
                </div>
              </div>
              <ConfirmDialog
                isOpen={!!confirmDeleteItem}
                message={`「${confirmDeleteItem?.name}」を削除しますか？`}
                onConfirm={handleConfirmDelete}
                onCancel={handleCancelDelete}
              />
              <CreateItemModal
                isOpen={isModalOpen}
                initialName={prefill.name || filter.searchText}
                initialCategory={filter.category ?? "★"}
                initialWantToBuy={filter.wantToBuyOnly}
                initialImageUrl={prefill.imageUrl}
                initialSourceUrl={prefill.sourceUrl}
                onClose={handleCloseCreateModal}
                onCreate={handleCreateAndResetFilter}
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
                onClose={handleCloseImageEdit}
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
