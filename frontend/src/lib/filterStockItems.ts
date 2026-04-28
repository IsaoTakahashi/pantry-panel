import type { StockItem } from "@/types/stockItem";

export type FilterCondition = {
  searchText: string;
  wantToBuyOnly: boolean;
  category: string | null;
};

export function filterStockItems(
  items: StockItem[],
  condition: FilterCondition,
): StockItem[] {
  return items
    .filter((item) => !condition.wantToBuyOnly || item.wantToBuy)
    .filter(
      (item) => !condition.category || item.category === condition.category,
    )
    .filter((item) => item.name.includes(condition.searchText));
}
