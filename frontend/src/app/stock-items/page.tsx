import { Suspense } from "react";
import StockItemsClient from "./StockItemsClient";
import StockItemsSkeleton from "./StockItemsSkeleton";

export default function StockItemsPage() {
  return (
    <Suspense fallback={<StockItemsSkeleton />}>
      <StockItemsClient />
    </Suspense>
  );
}
