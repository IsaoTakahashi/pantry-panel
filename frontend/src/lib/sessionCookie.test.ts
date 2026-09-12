import { createChunks, stringToBase64URL } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { buildSessionCookies, toCookieHeader } from "./sessionCookie";

const sampleSession = {
  access_token: "access-token-value",
  refresh_token: "refresh-token-value",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: { id: "user-1" },
} as unknown as Session;

describe("buildSessionCookies", () => {
  it("frontend/e2e/global-setup.ts と同じ cookie 名・値を生成する", () => {
    const supabaseUrl = "https://abcdefghijklmnop.supabase.co";

    const cookies = buildSessionCookies(supabaseUrl, sampleSession);

    const expectedEncodedValue = `base64-${stringToBase64URL(
      JSON.stringify(sampleSession),
    )}`;
    const expectedChunks = createChunks(
      "sb-abcdefghijklmnop-auth-token",
      expectedEncodedValue,
    );

    expect(cookies).toEqual(expectedChunks);
    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe("sb-abcdefghijklmnop-auth-token");
  });

  it("project ref を Supabase URL のホスト名の先頭ラベルから取り出す", () => {
    const cookies = buildSessionCookies(
      "https://my-project-ref.supabase.co",
      sampleSession,
    );

    expect(cookies[0].name).toBe("sb-my-project-ref-auth-token");
  });

  it("大きなセッションは .0 / .1 ... にチャンク分割される", () => {
    const largeSession = {
      ...sampleSession,
      user: { id: "user-1", extra: "x".repeat(10000) },
    } as unknown as Session;

    const cookies = buildSessionCookies(
      "https://abcdefghijklmnop.supabase.co",
      largeSession,
    );

    expect(cookies.length).toBeGreaterThan(1);
    expect(cookies[0].name).toBe("sb-abcdefghijklmnop-auth-token.0");
    expect(cookies[1].name).toBe("sb-abcdefghijklmnop-auth-token.1");
  });
});

describe("toCookieHeader", () => {
  it("複数の cookie を '; ' 区切りの name=value 形式に結合する", () => {
    const header = toCookieHeader([
      { name: "a", value: "1" },
      { name: "b", value: "2" },
    ]);

    expect(header).toBe("a=1; b=2");
  });

  it("単一の cookie でも正しく変換する", () => {
    const header = toCookieHeader([{ name: "only", value: "value" }]);

    expect(header).toBe("only=value");
  });
});
