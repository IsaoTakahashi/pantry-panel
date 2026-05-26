"use client";

import { useEffect, useState } from "react";
import { MdShoppingCart } from "react-icons/md";
import { CATEGORIES } from "@/constants/categories";
import BaseModal from "./BaseModal";

type CreateItemModalProps = {
  isOpen: boolean;
  initialName: string;
  initialCategory: string;
  initialWantToBuy: boolean;
  initialImageUrl?: string | null;
  initialSourceUrl?: string | null;
  onClose: () => void;
  onCreate: (
    name: string,
    category: string,
    wantToBuy: boolean,
    imageUrl: string | null,
    sourceUrl: string | null,
  ) => Promise<void>;
};

export default function CreateItemModal({
  isOpen,
  initialName,
  initialCategory,
  initialWantToBuy,
  initialImageUrl,
  initialSourceUrl,
  onClose,
  onCreate,
}: CreateItemModalProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [wantToBuy, setWantToBuy] = useState(initialWantToBuy);
  const [imageUrl, setImageUrl] = useState<string | null>(
    initialImageUrl ?? null,
  );
  const [sourceUrl, setSourceUrl] = useState<string | null>(
    initialSourceUrl ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setCategory(initialCategory);
      setWantToBuy(initialWantToBuy);
      setImageUrl(initialImageUrl ?? null);
      setSourceUrl(initialSourceUrl ?? null);
      setError(null);
    }
  }, [
    isOpen,
    initialName,
    initialCategory,
    initialWantToBuy,
    initialImageUrl,
    initialSourceUrl,
  ]);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="商品を追加">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name, category, wantToBuy, imageUrl, sourceUrl)
            .then(onClose)
            .catch((err) => {
              const error = err instanceof Error ? err : new Error(String(err));
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
            {/* biome-ignore lint/performance/noImgElement: arbitrary external URLs */}
            <img
              src={imageUrl}
              alt="商品画像"
              className="w-full h-36 object-contain rounded-xl border-2 border-slate-100 bg-slate-50"
            />
          </div>
        )}
        <div className="mb-4">
          <label
            htmlFor="name"
            className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5"
          >
            名前
          </label>
          <input
            id="name"
            name="name"
            type="text"
            className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-[#00d1b2] focus:outline-none transition-colors"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label
            htmlFor="category"
            className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5"
          >
            カテゴリ
          </label>
          <select
            id="category"
            name="category"
            className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:border-[#00d1b2] focus:outline-none transition-colors bg-white"
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
          <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            買いたい
          </span>
          <button
            type="button"
            aria-label="買いたい"
            aria-pressed={wantToBuy}
            onClick={() => setWantToBuy((v) => !v)}
            className={
              wantToBuy
                ? "inline-flex items-center justify-center rounded-xl bg-[#00d1b2] hover:bg-[#00c4a7] px-3 py-2 text-white transition-colors"
                : "inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-slate-400 transition-colors"
            }
          >
            <MdShoppingCart aria-hidden size={20} />
          </button>
        </div>
        <div className="flex gap-3 sm:gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl py-2.5 text-sm transition-colors"
          >
            キャンセル
          </button>
          <button
            disabled={!name || !category}
            type="submit"
            className="flex-[2] sm:flex-none bg-[#00d1b2] hover:bg-[#00c4a7] text-white font-bold rounded-xl py-2.5 text-sm transition-colors disabled:bg-slate-200 disabled:cursor-not-allowed px-6"
          >
            追加
          </button>
        </div>
        {error && <p className="text-red-600 mt-3 text-sm">{error}</p>}
      </form>
    </BaseModal>
  );
}
