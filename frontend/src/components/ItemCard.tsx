import Image from "next/image";
import { MdDelete, MdImage, MdOpenInNew, MdShoppingCart } from "react-icons/md";
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
      className={`flex items-center gap-3 rounded-2xl border-2 bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow-md ${item.wantToBuy ? "border-blue-200 bg-blue-50/30" : "border-slate-100"}`}
    >
      <button
        type="button"
        aria-label={item.imageUrl ? "画像を変更" : "画像を設定"}
        onClick={() => onImageEdit(item)}
        className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border-2 border-slate-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
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
        <span className="inline-block bg-teal-50 text-teal-700 text-xs px-2 py-0.5 rounded-full mb-1">
          {item.category}
        </span>
        <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
      </button>
      {item.sourceUrl && (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="商品ページを開く"
          className="w-9 h-9 rounded-xl bg-transparent p-0 text-slate-300 hover:text-slate-500 inline-flex items-center justify-center"
        >
          <MdOpenInNew aria-hidden size={22} />
        </a>
      )}
      <button
        type="button"
        aria-label="want to buy"
        aria-pressed={item.wantToBuy}
        onClick={() => onToggleWantToBuy(item)}
        className={
          item.wantToBuy
            ? "w-9 h-9 rounded-xl bg-transparent p-0 text-blue-500 hover:text-blue-600 inline-flex items-center justify-center"
            : "w-9 h-9 rounded-xl bg-transparent p-0 text-gray-300 hover:text-gray-400 inline-flex items-center justify-center"
        }
      >
        <MdShoppingCart aria-hidden size={28} />
      </button>
      <button
        type="button"
        aria-label="削除"
        disabled={item.wantToBuy}
        className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 p-0 text-red-300 inline-flex items-center justify-center disabled:bg-slate-100 disabled:text-slate-200 disabled:cursor-not-allowed"
        onClick={() => onDelete(item.id)}
      >
        <MdDelete aria-hidden size={28} />
      </button>
    </article>
  );
}
