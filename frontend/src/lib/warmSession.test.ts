import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPasswordMock = vi.fn();
const refreshSessionMock = vi.fn();
const createClientMock = vi.fn((_url: string, _key: string) => ({
  auth: {
    signInWithPassword: signInWithPasswordMock,
    refreshSession: refreshSessionMock,
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string) => createClientMock(url, key),
}));

const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
const ANON_KEY = "anon-key";
const EMAIL = "warm@example.com";
const PASSWORD = "warm-password";

function makeSession(overrides: Partial<Session> = {}): Session {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: nowSeconds + 3600,
    token_type: "bearer",
    user: { id: "warm-user" },
    ...overrides,
  } as unknown as Session;
}

describe("getWarmSession", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockClear();
    signInWithPasswordMock.mockReset();
    refreshSessionMock.mockReset();
  });

  it("キャッシュが無いとき signInWithPassword で新規ログインする", async () => {
    const session = makeSession();
    signInWithPasswordMock.mockResolvedValue({
      data: { session },
      error: null,
    });
    const { getWarmSession } = await import("./warmSession");

    const result = await getWarmSession(
      SUPABASE_URL,
      ANON_KEY,
      EMAIL,
      PASSWORD,
    );

    expect(result).toEqual(session);
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("キャッシュされたセッションがまだ有効なら再利用し signInWithPassword を呼ばない", async () => {
    const session = makeSession();
    signInWithPasswordMock.mockResolvedValue({
      data: { session },
      error: null,
    });
    const { getWarmSession } = await import("./warmSession");

    await getWarmSession(SUPABASE_URL, ANON_KEY, EMAIL, PASSWORD);
    signInWithPasswordMock.mockClear();
    const result = await getWarmSession(
      SUPABASE_URL,
      ANON_KEY,
      EMAIL,
      PASSWORD,
    );

    expect(result).toEqual(session);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("期限が近いキャッシュ済みセッションは refreshSession でリフレッシュする", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const staleSession = makeSession({ expires_at: nowSeconds + 60 });
    const refreshedSession = makeSession({
      access_token: "refreshed-access-token",
      expires_at: nowSeconds + 3600,
    });
    signInWithPasswordMock.mockResolvedValue({
      data: { session: staleSession },
      error: null,
    });
    refreshSessionMock.mockResolvedValue({
      data: { session: refreshedSession },
      error: null,
    });
    const { getWarmSession } = await import("./warmSession");

    await getWarmSession(SUPABASE_URL, ANON_KEY, EMAIL, PASSWORD);
    signInWithPasswordMock.mockClear();
    const result = await getWarmSession(
      SUPABASE_URL,
      ANON_KEY,
      EMAIL,
      PASSWORD,
    );

    expect(result).toEqual(refreshedSession);
    expect(refreshSessionMock).toHaveBeenCalledWith({
      refresh_token: staleSession.refresh_token,
    });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("refreshSession が失敗したら signInWithPassword にフォールバックする", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const staleSession = makeSession({ expires_at: nowSeconds + 60 });
    const freshSession = makeSession({
      access_token: "fresh-access-token",
      expires_at: nowSeconds + 3600,
    });
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: staleSession },
      error: null,
    });
    refreshSessionMock.mockResolvedValue({
      data: { session: null },
      error: new Error("refresh failed"),
    });
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: freshSession },
      error: null,
    });
    const { getWarmSession } = await import("./warmSession");

    await getWarmSession(SUPABASE_URL, ANON_KEY, EMAIL, PASSWORD);
    const result = await getWarmSession(
      SUPABASE_URL,
      ANON_KEY,
      EMAIL,
      PASSWORD,
    );

    expect(result).toEqual(freshSession);
    expect(refreshSessionMock).toHaveBeenCalledWith({
      refresh_token: staleSession.refresh_token,
    });
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(2);
  });

  it("refreshSession が例外を投げても signInWithPassword にフォールバックする", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const staleSession = makeSession({ expires_at: nowSeconds + 60 });
    const freshSession = makeSession({
      access_token: "fresh-access-token-2",
      expires_at: nowSeconds + 3600,
    });
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: staleSession },
      error: null,
    });
    refreshSessionMock.mockRejectedValue(new Error("network error"));
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: freshSession },
      error: null,
    });
    const { getWarmSession } = await import("./warmSession");

    await getWarmSession(SUPABASE_URL, ANON_KEY, EMAIL, PASSWORD);
    const result = await getWarmSession(
      SUPABASE_URL,
      ANON_KEY,
      EMAIL,
      PASSWORD,
    );

    expect(result).toEqual(freshSession);
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(2);
  });

  it("signInWithPassword が失敗したら reject する", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: null },
      error: new Error("invalid credentials"),
    });
    const { getWarmSession } = await import("./warmSession");

    await expect(
      getWarmSession(SUPABASE_URL, ANON_KEY, EMAIL, PASSWORD),
    ).rejects.toThrow(/invalid credentials/);
  });
});
