"use client";

import { useEffect, useState } from "react";
import ItemCard from "@/components/ItemCard";
import { fetchStockItems } from "@/lib/api";
import type { StockItem } from "@/types/stockItem";

export default function StockItemsPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  if (items.length === 0) {
    return <p>商品がありません</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onDelete={() => {}} />
      ))}
    </div>
  );
}
