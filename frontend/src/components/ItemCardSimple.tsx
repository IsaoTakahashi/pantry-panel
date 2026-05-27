import Image from "next/image";
import { MdImage, MdShoppingCart } from "react-icons/md";
import type { StockItem } from "@/types/stockItem";

type ItemCardProps = {
  item: StockItem;
  onEdit: (item: StockItem) => void;
  onToggleWantToBuy: (item: StockItem) => void;
  onDelete: (id: string) => void;
  onImageEdit: (item: StockItem) => void;
};

export default function ItemCardSimple({
  item,
  onEdit,
  onToggleWantToBuy,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: シンプル表示では削除機能を提供しないため、onDelete は使用しないが props として受け取る設計（design.md 参照）
  onDelete,
  onImageEdit,
}: ItemCardProps) {
  return (
    <article
      aria-label={item.name}
      className="flex items-center gap-3 rounded-2xl border-2 border-slate-100 bg-white px-4 py-2 shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        aria-label={item.imageUrl ? "画像を変更" : "画像を設定"}
        onClick={() => onImageEdit(item)}
        className="shrink-0 w-8 h-8 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            unoptimized
            width={32}
            height={32}
            className="w-full h-full object-cover"
          />
        ) : (
          <MdImage size={16} className="text-gray-400" aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:ring-offset-2 rounded min-w-0"
        onClick={() => onEdit(item)}
      >
        <span className="shrink-0 w-16 text-center bg-teal-50 text-teal-700 text-xs px-2 py-0.5 rounded-full truncate">
          {item.category}
        </span>
        <h3 className="flex-1 min-w-0 text-base font-medium text-gray-900 truncate">
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
            ? "w-9 h-8 rounded-xl bg-transparent p-0 text-blue-500 hover:text-blue-600 inline-flex items-center justify-center"
            : "w-9 h-8 rounded-xl bg-transparent p-0 text-gray-300 hover:text-gray-400 inline-flex items-center justify-center"
        }
      >
        <MdShoppingCart aria-hidden size={24} />
      </button>
    </article>
  );
}
