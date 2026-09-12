import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getWarmSessionMock = vi.fn();
vi.mock("@/lib/warmSession", () => ({
  getWarmSession: (...args: [string, string, string, string]) =>
    getWarmSessionMock(...args),
}));

const buildSessionCookiesMock = vi.fn();
vi.mock("@/lib/sessionCookie", () => ({
  buildSessionCookies: (...args: [string, unknown]) =>
    buildSessionCookiesMock(...args),
  toCookieHeader: (cookies: { name: string; value: string }[]) =>
    cookies.map((c) => `${c.name}=${c.value}`).join("; "),
}));

function makeRequest(headers?: Record<string, string>): NextRequest {
  return new NextRequest(
    new URL("/api/warm/stock-items", "https://app.example.com"),
    {
      headers,
    },
  );
}

describe("GET /api/warm/stock-items", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    getWarmSessionMock.mockReset();
    buildSessionCookiesMock.mockReset();
    buildSessionCookiesMock.mockReturnValue([
      { name: "sb-abc-auth-token", value: "cookie-value" },
    ]);
    getWarmSessionMock.mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    process.env.WARMUP_SHARED_SECRET = "shared-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.WARM_USER_EMAIL = "warm@example.com";
    process.env.WARM_USER_PASSWORD = "warm-password";
    process.env.WARM_GROUP_ID = "group-1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("secret ヘッダーが無いとき 401 を返し Supabase を一切呼ばない", async () => {
    const { GET } = await import("./route");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "unauthorized" });
    expect(getWarmSessionMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("secret ヘッダーが間違っているとき 401 を返す", async () => {
    const { GET } = await import("./route");

    const res = await GET(makeRequest({ "x-warmup-secret": "wrong-secret" }));

    expect(res.status).toBe(401);
    expect(getWarmSessionMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("WARMUP_SHARED_SECRET 自体が未設定のとき、常に 401 を返す（open access にしない）", async () => {
    process.env.WARMUP_SHARED_SECRET = "";
    const { GET } = await import("./route");

    const res = await GET(makeRequest({ "x-warmup-secret": "" }));

    expect(res.status).toBe(401);
    expect(getWarmSessionMock).not.toHaveBeenCalled();
  });

  it("secret が正しく内部 fetch が200のとき 200 を返す", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { GET } = await import("./route");

    const res = await GET(makeRequest({ "x-warmup-secret": "shared-secret" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(getWarmSessionMock).toHaveBeenCalledWith(
      "https://abc.supabase.co",
      "anon-key",
      "warm@example.com",
      "warm-password",
    );
    expect(buildSessionCookiesMock).toHaveBeenCalledWith(
      "https://abc.supabase.co",
      expect.objectContaining({ access_token: "access-token" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL("/stock-items", "https://app.example.com"),
      expect.objectContaining({
        redirect: "manual",
        cache: "no-store",
        headers: {
          Cookie:
            "sb-abc-auth-token=cookie-value; pantry-panel-active-group=group-1",
        },
      }),
    );
  });

  it("内部 fetch が /login へリダイレクトするとき 502 と location を返す", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { location: "/login" },
      }),
    );
    const { GET } = await import("./route");

    const res = await GET(makeRequest({ "x-warmup-secret": "shared-secret" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.status).toBe(307);
    expect(body.location).toBe("/login");
  });

  it("内部 fetch がエラーステータスのとき 502 を返す", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
    const { GET } = await import("./route");

    const res = await GET(makeRequest({ "x-warmup-secret": "shared-secret" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.status).toBe(500);
  });

  it("サインインが失敗するなど予期しない例外が起きたとき 502 と JSON body を返す", async () => {
    getWarmSessionMock.mockRejectedValue(new Error("sign-in failed"));
    const { GET } = await import("./route");

    const res = await GET(makeRequest({ "x-warmup-secret": "shared-secret" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toContain("sign-in failed");
    expect(fetch).not.toHaveBeenCalled();
  });
});
