type StockItem = {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  wantToBuy: boolean;
  createdAt: string;
  updatedAt: string;
};

type CreateStockItemRequest = {
  name: string;
  category: string;
};

type UpdateStockItemRequest = {
  name?: string;
  category?: string;
  wantToBuy?: boolean;
};

type ErrorResponse = {
  message: string;
};

export type {
  CreateStockItemRequest,
  ErrorResponse,
  StockItem,
  UpdateStockItemRequest,
};
