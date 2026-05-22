import type { HealthResponse } from "@/types/health";
import type {
  CreateStockItemRequest,
  ImageSearchResult,
  StockItem,
  UpdateStockItemRequest,
} from "@/types/stockItem";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function apiHeaders(accessToken?: string, activeGroupId?: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (activeGroupId) headers["X-Active-Group-ID"] = activeGroupId;
  return headers;
}

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchStockItems(
  accessToken?: string,
  activeGroupId?: string,
): Promise<StockItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items`, {
    headers: apiHeaders(accessToken, activeGroupId),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function createStockItem(
  req: CreateStockItemRequest,
  accessToken?: string,
  activeGroupId?: string,
): Promise<StockItem> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...apiHeaders(accessToken, activeGroupId),
    },
    body: JSON.stringify(req),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function updateStockItem(
  id: string,
  req: UpdateStockItemRequest,
  accessToken?: string,
  activeGroupId?: string,
): Promise<StockItem> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...apiHeaders(accessToken, activeGroupId),
    },
    body: JSON.stringify(req),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function deleteStockItem(
  id: string,
  accessToken?: string,
  activeGroupId?: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items/${id}`, {
    method: "DELETE",
    headers: apiHeaders(accessToken, activeGroupId),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export type ExtractFromUrlErrorKind =
  | "badRequest"
  | "extractionFailed"
  | "fetchFailed"
  | "unknown";

export class ExtractFromUrlError extends Error {
  kind: ExtractFromUrlErrorKind;
  constructor(kind: ExtractFromUrlErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ExtractFromUrlError";
    this.kind = kind;
  }
}

export type ExtractFromUrlResult = {
  name: string;
  imageUrl: string | null;
};

async function extractFromUrl(
  url: string,
  accessToken?: string,
  activeGroupId?: string,
): Promise<ExtractFromUrlResult> {
  const response = await fetch(`${API_BASE_URL}/api/extract-from-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...apiHeaders(accessToken, activeGroupId),
    },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    if (response.status === 400) throw new ExtractFromUrlError("badRequest");
    if (response.status === 422)
      throw new ExtractFromUrlError("extractionFailed");
    if (response.status === 502) throw new ExtractFromUrlError("fetchFailed");
    throw new ExtractFromUrlError("unknown", `HTTP ${response.status}`);
  }
  return response.json();
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
  accessToken?: string,
  activeGroupId?: string,
): Promise<ImageSearchResult[]> {
  const params = new URLSearchParams({ q: query, num: String(num) });
  const response = await fetch(`${API_BASE_URL}/api/image-search?${params}`, {
    headers: apiHeaders(accessToken, activeGroupId),
  });
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
  extractFromUrl,
  fetchHealth,
  fetchStockItems,
  searchImages,
  updateStockItem,
};
