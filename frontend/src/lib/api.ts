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
  detail?: string;
  constructor(
    kind: ExtractFromUrlErrorKind,
    message?: string,
    detail?: string,
  ) {
    super(message ?? kind);
    this.name = "ExtractFromUrlError";
    this.kind = kind;
    this.detail = detail;
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
    let detail: string | undefined;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    if (response.status === 400)
      throw new ExtractFromUrlError("badRequest", undefined, detail);
    if (response.status === 422)
      throw new ExtractFromUrlError("extractionFailed", undefined, detail);
    if (response.status === 502)
      throw new ExtractFromUrlError("fetchFailed", undefined, detail);
    throw new ExtractFromUrlError("unknown", `HTTP ${response.status}`, detail);
  }
  return response.json();
}

export type ExtractionProgressEvent = {
  step: "fetching" | "fetching_jina" | "extracting" | "generating_candidates";
  message: string;
};

export type ExtractionDoneEvent = {
  name: string;
  imageUrl: string | null;
};

export type ExtractionErrorEvent = {
  kind: ExtractFromUrlErrorKind;
  message: string;
  detail: string;
};

async function extractFromUrlStream(
  url: string,
  onProgress: (event: ExtractionProgressEvent) => void,
  onDone: (event: ExtractionDoneEvent) => void,
  onError: (error: ExtractFromUrlError) => void,
  accessToken?: string,
  activeGroupId?: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/extract-from-url/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...apiHeaders(accessToken, activeGroupId),
      },
      body: JSON.stringify({ url }),
    });
  } catch {
    onError(new ExtractFromUrlError("unknown", "Network error"));
    return;
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    if (response.status === 400) {
      onError(new ExtractFromUrlError("badRequest", undefined, detail));
    } else {
      onError(
        new ExtractFromUrlError("unknown", `HTTP ${response.status}`, detail),
      );
    }
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError(new ExtractFromUrlError("unknown", "No response body"));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const parseAndDispatch = (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      let eventType = "";
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6).trim();
      }
      if (!eventType || !data) continue;
      try {
        const parsed = JSON.parse(data);
        if (eventType === "progress") {
          onProgress(parsed as ExtractionProgressEvent);
        } else if (eventType === "done") {
          onDone(parsed as ExtractionDoneEvent);
        } else if (eventType === "error") {
          const ev = parsed as ExtractionErrorEvent;
          onError(new ExtractFromUrlError(ev.kind, ev.message, ev.detail));
        }
      } catch {
        /* ignore malformed SSE data */
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parseAndDispatch(decoder.decode(value, { stream: true }));
    }
    parseAndDispatch(decoder.decode());
  } catch {
    onError(new ExtractFromUrlError("unknown", "Stream interrupted"));
  } finally {
    reader.releaseLock();
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
  extractFromUrlStream,
  fetchHealth,
  fetchStockItems,
  searchImages,
  updateStockItem,
};
