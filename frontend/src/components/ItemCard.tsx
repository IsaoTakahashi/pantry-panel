import type { StockItem } from "@/types/stockItem";

export default function ItemCard({
  item,
  onDelete,
}: {
  item: StockItem;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex-1">
        <span className="inline-block bg-[#ebfffc] text-[#00947e] text-xs px-2 py-0.5 rounded-full mb-1">
          {item.category}
        </span>
        <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
      </div>
      {!item.wantToBuy && (
        <button
          type="button"
          className="rounded bg-[#ff3860] hover:bg-[#ff2b56] px-3 py-1.5 text-white text-sm font-medium"
          onClick={() => onDelete(item.id)}
        >
          削除
        </button>
      )}
    </div>
  );
}
