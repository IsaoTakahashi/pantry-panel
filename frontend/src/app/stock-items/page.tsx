import { Suspense } from "react";
import { getInitialStockItems } from "./getInitialStockItems";
import StockItemsClient from "./StockItemsClient";
import StockItemsSkeleton from "./StockItemsSkeleton";

export default async function StockItemsPage() {
  const initialItems = await getInitialStockItems();
  return (
    <Suspense fallback={<StockItemsSkeleton />}>
      <StockItemsClient initialItems={initialItems} />
    </Suspense>
  );
}
