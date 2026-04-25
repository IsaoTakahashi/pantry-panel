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

  if (loading) {
    return <p>Loading...</p>;
  }

  if (error) {
    return <p>商品を取得できませんでした</p>;
  }

  return (
    <div>
      <button type="button" onClick={() => setIsModalOpen(true)}>
        商品を追加
      </button>
      <CreateItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreate}
      />
      {items.length === 0 ? (
        <p>商品がありません</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
