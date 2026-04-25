import type { StockItem } from "@/types/stockItem";

export default function ItemCard({
  item,
  onDelete,
}: {
  item: StockItem;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded border p-4">
      <div className="flex-1">
        <h3 className="text-lg font-bold">{item.name}</h3>
        <p>{item.category}</p>
      </div>
      {!item.wantToBuy && (
        <button
          type="button"
          className="rounded bg-red-500 px-4 py-2 text-white"
          onClick={() => onDelete(item.id)}
        >
          削除
        </button>
      )}
    </div>
  );
}
