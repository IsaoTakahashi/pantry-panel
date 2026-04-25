"use client";

import { useState } from "react";
import { CATEGORIES } from "@/constants/categories";

type CreateItemModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, category: string) => Promise<void>;
};

export default function CreateItemModal({
  isOpen,
  onClose,
  onCreate,
}: CreateItemModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      className={`fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 ${"block"}`}
    >
      <div className="bg-white p-6 rounded shadow-md w-80">
        <h2 className="text-xl font-bold mb-4">商品を追加</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(name, category)
              .then(onClose)
              .catch((err) => {
                if (err.message.includes("409")) {
                  setError(err.message);
                }
              });
          }}
        >
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              名前
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="w-full border border-gray-300 rounded px-3 py-2"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="category"
              className="block text-sm font-medium mb-1"
            >
              カテゴリ
            </label>
            <select
              id="category"
              name="category"
              className="w-full border border-gray-300 rounded px-3 py-2"
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
          <button
            disabled={!name || !category}
            type="submit"
            className="w-full bg-blue-500 text-white py-2 rounded disabled:bg-gray-300"
          >
            追加
          </button>
          {error && <p className="text-red-500 mt-2">その商品は登録済みです</p>}
        </form>
      </div>
    </div>
  );
}
