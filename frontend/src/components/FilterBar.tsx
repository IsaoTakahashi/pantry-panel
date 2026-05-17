"use client";

import { MdShoppingCart } from "react-icons/md";
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
            className="absolute right-0 top-1/2 -translate-y-1/2 flex h-full items-center px-3 text-xl leading-none text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            ×
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 items-center gap-3">
        <button
          type="button"
          aria-label="買いたいものだけ"
          aria-pressed={value.wantToBuyOnly}
          onClick={toggleWantToBuyOnly}
          className={
            value.wantToBuyOnly
              ? "w-full inline-flex items-center justify-center rounded bg-blue-500 hover:bg-blue-600 px-3 py-2 text-white"
              : "w-full inline-flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 px-3 py-2 text-gray-500"
          }
        >
          <MdShoppingCart aria-hidden size={24} />
        </button>
        <select
          aria-label="カテゴリ"
          value={value.category ?? ""}
          onChange={handleCategoryChange}
          className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
        >
          <option value="">全部</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          role="switch"
          aria-checked={viewMode === "simple"}
          aria-label="表示モード"
          onClick={toggleViewMode}
          className="relative inline-flex items-center rounded-full bg-gray-200 p-1"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-[#00d1b2] transition-transform duration-200 ease-out ${
              viewMode === "simple" ? "translate-x-full" : "translate-x-0"
            }`}
          />
          <span
            className={`relative z-10 w-20 text-center px-2 py-1 text-sm font-medium transition-colors duration-200 ${
              viewMode === "normal" ? "text-white" : "text-gray-500"
            }`}
          >
            通常
          </span>
          <span
            className={`relative z-10 w-20 text-center px-2 py-1 text-sm font-medium transition-colors duration-200 ${
              viewMode === "simple" ? "text-white" : "text-gray-500"
            }`}
          >
            シンプル
          </span>
        </button>
      </div>
    </div>
  );
}
