"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/constants/categories";

type CreateItemModalProps = {
  isOpen: boolean;
  initialCategory: string;
  onClose: () => void;
  onCreate: (name: string, category: string) => Promise<void>;
};

export default function CreateItemModal({
  isOpen,
  initialCategory,
  onClose,
  onCreate,
}: CreateItemModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setCategory(initialCategory);
      setError(null);
    }
  }, [isOpen, initialCategory]);

  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-white p-6 rounded-lg shadow-xl w-96">
        <h2 className="text-lg font-semibold mb-6 text-gray-900">商品を追加</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(name, category)
              .then(onClose)
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
              className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:border-transparent"
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
              className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:border-transparent"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
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
              onClick={onClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium"
            >
              キャンセル
            </button>
            <button
              disabled={!name || !category}
              type="submit"
              className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              追加
            </button>
          </div>
          {error && <p className="text-red-600 mt-3 text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
