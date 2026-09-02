import { beforeEach, describe, expect, it, vi } from "vitest";

// @supabase/supabase-js の createClient を mock
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })), // 最小限の fake client
}));

describe("getSupabaseClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("env が設定されているとき non-null を返す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { getSupabaseClient } = await import("./supabaseClient");
    expect(await getSupabaseClient()).not.toBeNull();
  });

  it("URL が未設定のとき null を返し warn を出す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getSupabaseClient } = await import("./supabaseClient");
    expect(await getSupabaseClient()).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("ANON_KEY が未設定のとき null を返し warn を出す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getSupabaseClient } = await import("./supabaseClient");
    expect(await getSupabaseClient()).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
