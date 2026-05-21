import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("バックエンドが200を返すとき status:ok を返す", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", backend: { status: "ok" } });
  });

  it("バックエンドが5xxを返すとき status:degraded を返す", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.backend.status).toBe("error");
    expect(body.backend.message).toContain("503");
  });

  it("バックエンドへの接続が失敗するとき status:degraded を返す", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.backend.status).toBe("error");
    expect(body.backend.message).toBe("ECONNREFUSED");
  });

  it("タイムアウトのとき status:degraded かつ message:timeout を返す", async () => {
    const abortError = new DOMException(
      "The operation was aborted",
      "AbortError",
    );
    vi.mocked(fetch).mockRejectedValue(abortError);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.backend.status).toBe("error");
    expect(body.backend.message).toBe("timeout");
  });
});
