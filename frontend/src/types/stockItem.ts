type StockItem = {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  wantToBuy: boolean;
  createdAt: string;
  updatedAt: string;
  sortedAt: string;
};

type CreateStockItemRequest = {
  name: string;
  category: string;
  wantToBuy?: boolean;
  sourceUrl?: string;
};

type UpdateStockItemRequest = {
  name?: string;
  category?: string;
  wantToBuy?: boolean;
  imageUrl?: string | null;
  sourceUrl?: string | null;
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
