"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/constants/categories";
import type { StockItem } from "@/types/stockItem";
import BaseModal from "./BaseModal";

type EditItemModalProps = {
  item: StockItem | null;
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

  if (!item) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title="商品を編集">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name, category)
            .then(handleClose)
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
        <div className="mb-6">
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
            <option value="">選択してください</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 sm:gap-2 sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl py-2.5 text-sm transition-colors"
          >
            キャンセル
          </button>
          <button
            disabled={!name || !category}
            type="submit"
            className="flex-[2] sm:flex-none bg-[#00d1b2] hover:bg-[#00c4a7] text-white font-bold rounded-xl py-2.5 text-sm transition-colors disabled:bg-slate-200 disabled:cursor-not-allowed px-6"
          >
            保存
          </button>
        </div>
        {error && <p className="text-red-600 mt-3 text-sm">{error}</p>}
      </form>
    </BaseModal>
  );
}
