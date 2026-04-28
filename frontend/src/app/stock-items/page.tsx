"use client";

import { useEffect, useMemo, useState } from "react";
import CreateItemModal from "@/components/CreateItemModal";
import EditItemModal from "@/components/EditItemModal";
import FilterBar from "@/components/FilterBar";
import ItemCard from "@/components/ItemCard";
import {
  createStockItem,
  deleteStockItem,
  fetchStockItems,
  updateStockItem,
} from "@/lib/api";
import { type FilterCondition, filterStockItems } from "@/lib/filterStockItems";
import type { StockItem } from "@/types/stockItem";

export default function StockItemsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterCondition>({
    searchText: "",
    wantToBuyOnly: false,
    category: null,
  });

  const filteredItems = useMemo(
    () => filterStockItems(items, filter),
    [items, filter],
  );

  const handleCreate = async (name: string, category: string) => {
    await createStockItem({ name, category });
    const data = await fetchStockItems();
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
    await updateStockItem(editingItem.id, { name, category });
    const data = await fetchStockItems();
    setItems(data);
  };

  const handleToggleWantToBuy = async (item: StockItem) => {
    await updateStockItem(item.id, { wantToBuy: !item.wantToBuy });
    const data = await fetchStockItems();
    setItems(data);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("この商品を削除しますか？")) return;
    await deleteStockItem(id);
    const data = await fetchStockItems();
    setItems(data);
  };

  useEffect(() => {
    fetchStockItems()
      .then((data) => setItems(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unknown error"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb] text-white py-4 px-6">
        <h1 className="text-2xl font-bold">Pantry Panel</h1>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center py-12 text-gray-600">Loading...</p>
        ) : error ? (
          <p className="text-center py-12 text-red-600">
            商品を取得できませんでした
          </p>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <FilterBar value={filter} onChange={setFilter} />
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
              onClose={() => setIsModalOpen(false)}
              onCreate={handleCreate}
            />
            <EditItemModal
              item={editingItem}
              isOpen={!!editingItem}
              onClose={handleCloseEdit}
              onSave={handleSave}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onDelete={handleDelete}
                    onEdit={handleOpenEdit}
                    onToggleWantToBuy={handleToggleWantToBuy}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
