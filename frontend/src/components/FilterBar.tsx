"use client";

import { CATEGORIES } from "@/constants/categories";
import type { FilterCondition } from "@/lib/filterStockItems";

type FilterBarProps = {
  value: FilterCondition;
  onChange: (next: FilterCondition) => void;
};

export default function FilterBar({ value, onChange }: FilterBarProps) {
  const handleSearchTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, searchText: e.target.value });
  };

  const handleClearSearchText = () => {
    onChange({ ...value, searchText: "" });
  };

  const handleWantToBuyOnlyChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    onChange({ ...value, wantToBuyOnly: e.target.checked });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...value,
      category: e.target.value === "" ? null : e.target.value,
    });
  };

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
      <div className="relative w-full md:w-auto">
        <input
          type="search"
          aria-label="検索"
          placeholder="検索"
          value={value.searchText}
          onChange={handleSearchTextChange}
          className="w-full md:w-auto border border-gray-300 rounded px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500
  [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value.searchText && (
          <button
            type="button"
            aria-label="クリア"
            onClick={handleClearSearchText}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            ×
          </button>
        )}
      </div>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={value.wantToBuyOnly}
          onChange={handleWantToBuyOnlyChange}
        />
        買いたいものだけ
      </label>
      <label className="flex items-center gap-1">
        カテゴリ
        <select
          value={value.category ?? ""}
          onChange={handleCategoryChange}
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
  );
}
