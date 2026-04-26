"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/constants/categories";
import type { StockItem } from "@/types/stockItem";

type EditItemModalProps = {
  item: StockItem | null; // 編集対象。null なら何もレンダリングしない
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, category: string) => Promise<void>;
};

export default function EditItemModal({
  item,
  isOpen,
  onClose,
  onSave,
}: EditItemModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setCategory(item.category);
    }
    if (!isOpen) {
      setName("");
      setCategory("");
      setError(null);
    }
  }, [item, isOpen]);

  const handleClose = () => {
    setName("");
    setCategory("");
    setError(null);
    onClose();
  };

  if (!(isOpen && item)) return null;
  return (
    <div
      role="dialog"
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
    >
      <div className="bg-white p-6 rounded-lg shadow-xl w-96">
        <h2 className="text-lg font-semibold mb-6 text-gray-900">商品を編集</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(name, category)
              .then(handleClose)
              .catch((err) => {
                const error =
                  err instanceof Error ? err : new Error(String(err));
                if (error.message.includes("409")) {
                  setError("その商品は登録済みです");
                } else {
                  setError(error.message || "エラーが発生しました");
                }
              });
          }}
        >
          <div className="mb-4">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              名前
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:border-transparent"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="mb-6">
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              カテゴリ
            </label>
            <select
              id="category"
              name="category"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:border-transparent"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">選択してください</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium"
            >
              キャンセル
            </button>
            <button
              disabled={!name || !category}
              type="submit"
              className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              保存
            </button>
          </div>
          {error && <p className="text-red-600 mt-3 text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
