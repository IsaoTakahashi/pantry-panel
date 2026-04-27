import type { StockItem } from "@/types/stockItem";

type ItemCardProps = {
  item: StockItem;
  onEdit: (item: StockItem) => void;
  onToggleWantToBuy: (item: StockItem) => void;
  onDelete: (id: string) => void;
};

export default function ItemCard({
  item,
  onEdit,
  onToggleWantToBuy,
  onDelete,
}: ItemCardProps) {
  return (
    <article
      aria-label={item.name}
      className="flex items-center gap-4 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        className="flex-1 text-left focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:ring-offset-2 rounded"
        onClick={() => onEdit(item)}
      >
        <span className="inline-block bg-[#ebfffc] text-[#00947e] text-xs px-2 py-0.5 rounded-full mb-1">
          {item.category}
        </span>
        <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
      </button>
      <button
        type="button"
        aria-label="want to buy"
        aria-pressed={item.wantToBuy}
        onClick={() => onToggleWantToBuy(item)}
        className={
          item.wantToBuy
            ? "rounded bg-[#00d1b2] hover:bg-[#00c4a7] px-3 py-1.5 text-white text-sm font-medium"
            : "rounded bg-gray-200 hover:bg-gray-300 px-3 py-1.5 text-gray-500 text-sm font-medium"
        }
      >
        🛒
      </button>
      <button
        type="button"
        disabled={item.wantToBuy}
        className="rounded bg-[#ff3860] hover:bg-[#ff2b56] px-3 py-1.5 text-white text-sm font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
        onClick={() => onDelete(item.id)}
      >
        削除
      </button>
    </article>
  );
}
