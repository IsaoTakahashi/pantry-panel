import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth } from "./api";

describe("fetchHealth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常レスポンスで HealthResponse を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", db: "connected" }), {
        status: 200,
      }),
    );

    const result = await fetchHealth();
    expect(result).toEqual({ status: "ok", db: "connected" });
  });

  it("503 レスポンスで throw される", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    await expect(fetchHealth()).rejects.toThrow("HTTP 503");
  });

  it("ネットワークエラーで throw される", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    await expect(fetchHealth()).rejects.toThrow("Failed to fetch");
  });
});
