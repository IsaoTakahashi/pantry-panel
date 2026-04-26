"use client";

import { useEffect, useState } from "react";
import CreateItemModal from "@/components/CreateItemModal";
import ItemCard from "@/components/ItemCard";
import { createStockItem, deleteStockItem, fetchStockItems } from "@/lib/api";
import type { StockItem } from "@/types/stockItem";

export default function StockItemsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (name: string, category: string) => {
    await createStockItem({ name, category });
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
            <div className="mb-6 flex justify-end">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium"
              >
                商品を追加
              </button>
            </div>
            <CreateItemModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onCreate={handleCreate}
            />
            {items.length === 0 ? (
              <p className="text-center py-12 text-gray-600">
                商品がありません
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
