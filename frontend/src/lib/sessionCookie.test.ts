import { createChunks, stringToBase64URL } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  buildSessionCookies,
  readAccessTokenFromCookies,
  toCookieHeader,
} from "./sessionCookie";

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

// stock-items-ttfb-reduction Phase 2 (tasks.md 3.1): getInitialStockItems.ts が
// supabase.auth.getSession() を呼ばずに、middleware が検証・リフレッシュ済みの
// cookie から直接 access_token を読み取れるようにするための逆変換ヘルパー。
// buildSessionCookies() で作った cookie を読み戻せることをラウンドトリップで
// 検証する（モックではなく実際のエンコード/デコードを通す）。
describe("readAccessTokenFromCookies", () => {
  function cookieMapFrom(
    cookies: { name: string; value: string }[],
  ): (name: string) => string | undefined {
    const map = new Map(cookies.map((c) => [c.name, c.value]));
    return (name: string) => map.get(name);
  }

  it("buildSessionCookies で作った単一 cookie から access_token を読み戻す", async () => {
    const supabaseUrl = "https://abcdefghijklmnop.supabase.co";
    const cookies = buildSessionCookies(supabaseUrl, sampleSession);

    const token = await readAccessTokenFromCookies(
      supabaseUrl,
      cookieMapFrom(cookies),
    );

    expect(token).toBe("access-token-value");
  });

  it("チャンク分割された cookie からも access_token を読み戻す", async () => {
    const supabaseUrl = "https://abcdefghijklmnop.supabase.co";
    const largeSession = {
      ...sampleSession,
      user: { id: "user-1", extra: "x".repeat(10000) },
    } as unknown as Session;
    const cookies = buildSessionCookies(supabaseUrl, largeSession);
    expect(cookies.length).toBeGreaterThan(1);

    const token = await readAccessTokenFromCookies(
      supabaseUrl,
      cookieMapFrom(cookies),
    );

    expect(token).toBe("access-token-value");
  });

  it("cookie が存在しないとき null を返す", async () => {
    const token = await readAccessTokenFromCookies(
      "https://abcdefghijklmnop.supabase.co",
      () => undefined,
    );

    expect(token).toBeNull();
  });

  it("cookie の値が JSON として parse できないとき null を返す", async () => {
    const token = await readAccessTokenFromCookies(
      "https://abcdefghijklmnop.supabase.co",
      (name) =>
        name === "sb-abcdefghijklmnop-auth-token"
          ? "not-a-valid-base64-json-value"
          : undefined,
    );

    expect(token).toBeNull();
  });

  it("cookie の値が access_token を含まない JSON のとき null を返す", async () => {
    const supabaseUrl = "https://abcdefghijklmnop.supabase.co";
    const sessionWithoutToken = {
      user: { id: "user-1" },
    } as unknown as Session;
    const cookies = buildSessionCookies(supabaseUrl, sessionWithoutToken);

    const token = await readAccessTokenFromCookies(
      supabaseUrl,
      cookieMapFrom(cookies),
    );

    expect(token).toBeNull();
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
