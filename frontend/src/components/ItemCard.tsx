import Image from "next/image";
import { MdDelete, MdImage, MdShoppingCart } from "react-icons/md";
import type { StockItem } from "@/types/stockItem";

type ItemCardProps = {
  item: StockItem;
  onEdit: (item: StockItem) => void;
  onToggleWantToBuy: (item: StockItem) => void;
  onDelete: (id: string) => void;
  onImageEdit: (item: StockItem) => void;
};

export default function ItemCard({
  item,
  onEdit,
  onToggleWantToBuy,
  onDelete,
  onImageEdit,
}: ItemCardProps) {
  return (
    <article
      aria-label={item.name}
      className="flex items-center gap-4 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        aria-label={item.imageUrl ? "画像を変更" : "画像を設定"}
        onClick={() => onImageEdit(item)}
        className="shrink-0 w-16 h-16 rounded overflow-hidden bg-gray-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            unoptimized
            width={64}
            height={64}
            className="w-full h-full object-cover"
          />
        ) : (
          <MdImage size={28} className="text-gray-400" aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="flex-1 min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:ring-offset-2 rounded"
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
            ? "rounded bg-[#00d1b2] hover:bg-[#00c4a7] px-3 py-1.5 text-white inline-flex items-center"
            : "rounded bg-gray-200 hover:bg-gray-300 px-3 py-1.5 text-gray-500 inline-flex items-center"
        }
      >
        <MdShoppingCart aria-hidden size={20} />
      </button>
      <button
        type="button"
        aria-label="削除"
        disabled={item.wantToBuy}
        className="rounded bg-[#ff3860] hover:bg-[#ff2b56] px-3 py-1.5 text-white inline-flex items-center disabled:bg-gray-300 disabled:cursor-not-allowed"
        onClick={() => onDelete(item.id)}
      >
        <MdDelete aria-hidden size={20} />
      </button>
    </article>
  );
}
