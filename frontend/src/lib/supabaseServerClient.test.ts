import { beforeEach, describe, expect, it, vi } from "vitest";

// @supabase/ssr の createServerClient を mock
const createServerClientMock = vi.fn(
  (_url: string, _key: string, _options: { cookies: unknown }) => ({
    from: vi.fn(),
  }),
); // 最小限の fake client
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    url: string,
    key: string,
    options: { cookies: unknown },
  ) => createServerClientMock(url, key, options),
}));

describe("createSupabaseServerClient", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerClientMock.mockClear();
  });

  it("env が設定されているとき createServerClient を渡された cookie アクセサで呼び出す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { createSupabaseServerClient } = await import(
      "./supabaseServerClient"
    );

    const cookies = { getAll: vi.fn(() => []) };
    const client = createSupabaseServerClient(cookies);

    expect(client).not.toBeNull();
    expect(createServerClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      { cookies },
    );
  });

  it("URL が未設定のとき null を返し warn を出す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createSupabaseServerClient } = await import(
      "./supabaseServerClient"
    );

    const result = createSupabaseServerClient({ getAll: vi.fn(() => []) });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("ANON_KEY が未設定のとき null を返し warn を出す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createSupabaseServerClient } = await import(
      "./supabaseServerClient"
    );

    const result = createSupabaseServerClient({ getAll: vi.fn(() => []) });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("呼び出しごとに新規のクライアントを生成する（モジュールレベルキャッシュを持たない）", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { createSupabaseServerClient } = await import(
      "./supabaseServerClient"
    );

    createSupabaseServerClient({ getAll: vi.fn(() => []) });
    createSupabaseServerClient({ getAll: vi.fn(() => []) });

    expect(createServerClientMock).toHaveBeenCalledTimes(2);
  });
});
