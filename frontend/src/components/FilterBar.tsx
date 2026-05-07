"use client";

import { CATEGORIES } from "@/constants/categories";
import type { FilterCondition } from "@/lib/filterStockItems";

type FilterBarProps = {
  value: FilterCondition;
  viewMode: "normal" | "simple";
  onChange: (next: FilterCondition) => void;
  onViewModeChange: (next: "normal" | "simple") => void;
};

export default function FilterBar({
  value,
  viewMode,
  onChange,
  onViewModeChange,
}: FilterBarProps) {
  const handleSearchTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, searchText: e.target.value });
  };

  const handleClearSearchText = () => {
    onChange({ ...value, searchText: "" });
  };

  const toggleWantToBuyOnly = () => {
    onChange({ ...value, wantToBuyOnly: !value.wantToBuyOnly });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...value,
      category: e.target.value === "" ? null : e.target.value,
    });
  };

  const toggleViewMode = () => {
    onViewModeChange(viewMode === "simple" ? "normal" : "simple");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full">
        <input
          type="search"
          aria-label="検索"
          placeholder="検索"
          value={value.searchText}
          onChange={handleSearchTextChange}
          className="w-full border border-gray-300 rounded px-3 py-2 pr-10 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value.searchText && (
          <button
            type="button"
            aria-label="クリア"
            onClick={handleClearSearchText}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="買いたいものだけ"
          aria-pressed={value.wantToBuyOnly}
          onClick={toggleWantToBuyOnly}
          className={
            value.wantToBuyOnly
              ? "rounded bg-[#00d1b2] hover:bg-[#00c4a7] px-3 py-1.5 text-white text-sm font-medium"
              : "rounded bg-gray-200 hover:bg-gray-300 px-3 py-1.5 text-gray-500 text-sm font-medium"
          }
        >
          🛒
        </button>
        <label className="flex items-center gap-1 text-gray-900">
          カテゴリ
          <select
            value={value.category ?? ""}
            onChange={handleCategoryChange}
            className="border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
          >
            <option value="">全部</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          role="switch"
          aria-checked={viewMode === "simple"}
          aria-label="表示モード"
          onClick={toggleViewMode}
          className="inline-flex items-center rounded-full bg-gray-200 p-1"
        >
          <span
            className={
              viewMode === "normal"
                ? "rounded-full bg-[#00d1b2] text-white px-4 py-1 text-sm font-medium"
                : "text-gray-500 px-4 py-1 text-sm font-medium"
            }
          >
            通常
          </span>
          <span
            className={
              viewMode === "simple"
                ? "rounded-full bg-[#00d1b2] text-white px-4 py-1 text-sm font-medium"
                : "text-gray-500 px-4 py-1 text-sm font-medium"
            }
          >
            シンプル
          </span>
        </button>
      </div>
    </div>
  );
}
