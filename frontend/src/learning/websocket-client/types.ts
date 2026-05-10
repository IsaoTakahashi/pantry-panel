type StockItemEvent = {
  type: "stock_items.created" | "stock_items.updated" | "stock_items.deleted";
  payload: Record<string, unknown>;
};

export type { StockItemEvent };
