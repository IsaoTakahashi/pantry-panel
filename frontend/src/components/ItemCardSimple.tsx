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
      className="flex items-center gap-3 rounded-lg border bg-white px-4 py-2 shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        aria-label={item.imageUrl ? "画像を変更" : "画像を設定"}
        onClick={() => onImageEdit(item)}
        className="shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
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
            ? "rounded bg-[#00d1b2] hover:bg-[#00c4a7] px-3 py-1 text-white inline-flex items-center"
            : "rounded bg-gray-200 hover:bg-gray-300 px-3 py-1 text-gray-500 inline-flex items-center"
        }
      >
        <MdShoppingCart aria-hidden size={20} />
      </button>
    </article>
  );
}
