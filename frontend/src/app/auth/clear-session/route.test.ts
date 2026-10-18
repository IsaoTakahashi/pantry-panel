import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

function makeRequest(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(new URL(path, "https://example.com"), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("GET /auth/clear-session", () => {
  it("単一の sb-*-auth-token cookie を失効させて /login へ 307 リダイレクトする", async () => {
    const res = await GET(
      makeRequest("/auth/clear-session", { "sb-abc-auth-token": "v" }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/login");
    const cookie = res.cookies.get("sb-abc-auth-token");
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.path).toBe("/");
  });

  it("チャンク分割された auth-token cookie をすべて失効させる", async () => {
    const res = await GET(
      makeRequest("/auth/clear-session", {
        "sb-abc-auth-token.0": "a",
        "sb-abc-auth-token.1": "b",
      }),
    );

    for (const name of ["sb-abc-auth-token.0", "sb-abc-auth-token.1"]) {
      expect(res.cookies.get(name)?.maxAge).toBe(0);
    }
  });

  it("無関係な cookie は失効させない", async () => {
    const res = await GET(
      makeRequest("/auth/clear-session", {
        "sb-abc-auth-token": "v",
        other: "x",
      }),
    );

    expect(res.cookies.get("other")).toBeUndefined();
  });

  it("クエリで行き先を指定しても常に /login へ送る", async () => {
    const res = await GET(
      makeRequest(
        "/auth/clear-session?next=https://evil.com&redirect=//evil.com",
      ),
    );

    expect(res.headers.get("location")).toBe("https://example.com/login");
  });
});
