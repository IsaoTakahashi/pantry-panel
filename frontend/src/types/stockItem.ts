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
  wantToBuy?: boolean;
};

type UpdateStockItemRequest = {
  name?: string;
  category?: string;
  wantToBuy?: boolean;
  imageUrl?: string | null;
};

type ImageSearchResult = {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
};

type ErrorResponse = {
  message: string;
};

export type {
  CreateStockItemRequest,
  ErrorResponse,
  ImageSearchResult,
  StockItem,
  UpdateStockItemRequest,
};
