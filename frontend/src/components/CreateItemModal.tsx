"use client";

import { useEffect, useState } from "react";
import { MdShoppingCart } from "react-icons/md";
import { CATEGORIES } from "@/constants/categories";

type CreateItemModalProps = {
  isOpen: boolean;
  initialName: string;
  initialCategory: string;
  initialWantToBuy: boolean;
  initialImageUrl?: string | null;
  onClose: () => void;
  onCreate: (
    name: string,
    category: string,
    wantToBuy: boolean,
    imageUrl: string | null,
  ) => Promise<void>;
};

export default function CreateItemModal({
  isOpen,
  initialName,
  initialCategory,
  initialWantToBuy,
  initialImageUrl,
  onClose,
  onCreate,
}: CreateItemModalProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [wantToBuy, setWantToBuy] = useState(initialWantToBuy);
  const [imageUrl, setImageUrl] = useState<string | null>(
    initialImageUrl ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setCategory(initialCategory);
      setWantToBuy(initialWantToBuy);
      setImageUrl(initialImageUrl ?? null);
      setError(null);
    }
  }, [isOpen, initialName, initialCategory, initialWantToBuy, initialImageUrl]);

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
            onCreate(name, category, wantToBuy, imageUrl)
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
          {imageUrl && (
            <div className="mb-4">
              <img
                src={imageUrl}
                alt="商品画像"
                className="w-full h-36 object-contain rounded border border-gray-200 bg-gray-50"
              />
            </div>
          )}
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
          <div className="mb-4">
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
          <div className="mb-6">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              買いたい
            </span>
            <button
              type="button"
              aria-label="買いたい"
              aria-pressed={wantToBuy}
              onClick={() => setWantToBuy((v) => !v)}
              className={
                wantToBuy
                  ? "inline-flex items-center justify-center rounded bg-[#00d1b2] hover:bg-[#00c4a7] px-3 py-2 text-white"
                  : "inline-flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 px-3 py-2 text-gray-500"
              }
            >
              <MdShoppingCart aria-hidden size={20} />
            </button>
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
