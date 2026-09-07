import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// @supabase/ssr の createServerClient を mock し、middleware が
// getClaims() の結果 / エラーに応じてどう振る舞うかだけを確認する
// スモークテスト。網羅的なシナリオ（S-7/S-8）は Task 8 が担当する。
const getClaimsMock = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: getClaimsMock },
  }),
}));

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://example.com"));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaimsMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("保護ルート・セッション無しのとき /login へリダイレクトする", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/login");
  });

  it("保護ルート・有効なセッションありのとき通過させる", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("リフレッシュが例外を投げても fail open で通過させる（保護ルートでもリダイレクトしない）", async () => {
    getClaimsMock.mockRejectedValue(new Error("network error"));
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  // getClaims() は一時的な障害（AuthRetryableFetchError 等）でも reject せず、
  // `{ data: null, error }` を resolve で返す（auth-js の実装を確認済み）。
  // data === null だけを見て redirect すると、この resolve パスが未ログイン
  // 確定と誤判定され fail open が壊れる。これが実際の discriminator。
  it("getClaims が data:null かつ error 付きで resolve しても fail open で通過させる", async () => {
    getClaimsMock.mockResolvedValue({
      data: null,
      error: { name: "AuthRetryableFetchError", message: "fetch failed" },
    });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("/login は除外ルートなので getClaims を呼ばず通過させる", async () => {
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/login"));

    expect(res.status).toBe(200);
    expect(getClaimsMock).not.toHaveBeenCalled();
  });

  it("非保護ルート・セッション無しでもリダイレクトしない", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/health"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
