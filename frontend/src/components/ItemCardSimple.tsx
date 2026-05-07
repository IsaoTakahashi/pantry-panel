import type { StockItem } from "@/types/stockItem";

type ItemCardProps = {
  item: StockItem;
  onEdit: (item: StockItem) => void;
  onToggleWantToBuy: (item: StockItem) => void;
  onDelete: (id: string) => void;
};

export default function ItemCardSimple({
  item,
  onEdit,
  onToggleWantToBuy,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: シンプル表示では削除機能を提供しないため、onDelete は使用しないが props として受け取る設計（design.md 参照）
  onDelete,
}: ItemCardProps) {
  return (
    <article
      aria-label={item.name}
      className="flex items-center gap-3 rounded-lg border bg-white px-4 py-2 shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:ring-offset-2 rounded min-w-0"
        onClick={() => onEdit(item)}
      >
        <span className="shrink-0 bg-[#ebfffc] text-[#00947e] text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
          {item.category}
        </span>
        <h3 className="text-base font-medium text-gray-900 truncate">
          {item.name}
        </h3>
      </button>
      <button
        type="button"
        aria-label="want to buy"
        aria-pressed={item.wantToBuy}
        onClick={() => onToggleWantToBuy(item)}
        className={
          item.wantToBuy
            ? "rounded bg-[#00d1b2] hover:bg-[#00c4a7] px-3 py-1 text-white text-sm font-medium"
            : "rounded bg-gray-200 hover:bg-gray-300 px-3 py-1 text-gray-500 text-sm font-medium"
        }
      >
        🛒
      </button>
    </article>
  );
}
