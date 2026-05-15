import type { HealthResponse } from "@/types/health";
import type {
  CreateStockItemRequest,
  ImageSearchResult,
  StockItem,
  UpdateStockItemRequest,
} from "@/types/stockItem";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchStockItems(): Promise<StockItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function createStockItem(
  req: CreateStockItemRequest,
): Promise<StockItem> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function updateStockItem(
  id: string,
  req: UpdateStockItemRequest,
): Promise<StockItem> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function deleteStockItem(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

export type ImageSearchErrorKind =
  | "quota"
  | "upstream"
  | "unavailable"
  | "unknown";

export class ImageSearchError extends Error {
  kind: ImageSearchErrorKind;
  constructor(kind: ImageSearchErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ImageSearchError";
    this.kind = kind;
  }
}

async function searchImages(
  query: string,
  num = 10,
): Promise<ImageSearchResult[]> {
  const params = new URLSearchParams({ q: query, num: String(num) });
  const response = await fetch(`${API_BASE_URL}/api/image-search?${params}`);
  if (!response.ok) {
    if (response.status === 429) throw new ImageSearchError("quota");
    if (response.status === 502) throw new ImageSearchError("upstream");
    if (response.status === 503) throw new ImageSearchError("unavailable");
    throw new ImageSearchError("unknown", `HTTP ${response.status}`);
  }
  const body = await response.json();
  return body.items as ImageSearchResult[];
}

export {
  createStockItem,
  deleteStockItem,
  fetchHealth,
  fetchStockItems,
  searchImages,
  updateStockItem,
};
