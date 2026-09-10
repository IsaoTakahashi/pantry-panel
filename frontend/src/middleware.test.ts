import type { CookieOptions } from "@supabase/ssr";
import {
  AuthInvalidJwtError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
} from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// @supabase/ssr の createServerClient を mock し、middleware が
// getClaims() の結果 / エラーに応じてどう振る舞うかを確認する。
// S-7（リフレッシュ成功時に Set-Cookie が付与される）/ S-8（リフレッシュ
// 失敗時も fail open で通過する）は下記の専用テストで検証する。
//
// createServerClient に渡される cookies オプション（getAll/setAll）も
// 捕捉する。S-7（リフレッシュ成功時に Set-Cookie が付与される）を検証
// するには、getClaimsMock の実装内から setAll を呼び出して「@supabase/ssr
// がリフレッシュ中に内部で cookie を書き込む」挙動を再現する必要がある
// （route.test.ts の capturedCookieMethods パターンを踏襲）。
type CapturedCookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll?: (
    cookiesToSet: { name: string; value: string; options: CookieOptions }[],
    headers: Record<string, string>,
  ) => void;
};

let capturedCookieMethods: CapturedCookieMethods | null = null;
const getClaimsMock = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: CapturedCookieMethods },
  ) => {
    capturedCookieMethods = options.cookies;
    return {
      auth: { getClaims: getClaimsMock },
    };
  },
}));

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://example.com"));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaimsMock.mockReset();
    capturedCookieMethods = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("保護ルート・セッション無しのとき /login へリダイレクトする（正常系なのでログしない）", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/login");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("保護ルート・有効なセッションありのとき通過させる（正常系なのでログしない）", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("S-7: セッションリフレッシュ成功時、更新後の cookie が Set-Cookie として付与される", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaimsMock.mockImplementation(async () => {
      // @supabase/ssr が getClaims() 内部でリフレッシュを検知し、新しい
      // アクセストークンを cookie に書き込む挙動を再現する。
      capturedCookieMethods?.setAll?.(
        [
          {
            name: "sb-access-token",
            value: "refreshed-token-value",
            options: { path: "/" },
          },
        ],
        {
          "Cache-Control":
            "private, no-cache, no-store, must-revalidate, max-age=0",
        },
      );
      return { data: { claims: { sub: "user-1" } }, error: null };
    });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("sb-access-token")?.value).toBe(
      "refreshed-token-value",
    );
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("リフレッシュが例外を投げても fail open で通過させる（保護ルートでもリダイレクトしない）。console.error でログされる", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = new Error("network error");
    getClaimsMock.mockRejectedValue(thrown);
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // fail open は黙って行わず、observability のため必ずログを残す
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("threw"),
      thrown,
    );
    errorSpy.mockRestore();
  });

  // getClaims() は一時的な障害（AuthRetryableFetchError 等）でも reject せず、
  // `{ data: null, error }` を resolve で返す（auth-js の実装を確認済み）。
  // data === null だけを見て redirect すると、この resolve パスが未ログイン
  // 確定と誤判定され fail open が壊れる。これが実際の discriminator。
  //
  // モックは実際の AuthRetryableFetchError インスタンスを使う必要がある。
  // isAuthRetryableFetchError() は isAuthError()（`__isAuthError` プロパティの
  // ダックタイピング。AuthError のコンストラクタが実際に設定する）を経由する
  // ため、`{ name: "AuthRetryableFetchError" }` のようなプレーンオブジェクトは
  // 型ガードを満たさず、このテストは（変更後の実装に対して）誤って
  // 「定義不能 → fail open しない」分岐を通ってしまう。
  it("getClaims が AuthRetryableFetchError 付きで resolve しても fail open で通過させる。console.error でログされる", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimsError = new AuthRetryableFetchError("fetch failed", 0);
    getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // fail open は黙って行わず、observability のため必ずログを残す
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("resolved with an error"),
      claimsError,
    );
    errorSpy.mockRestore();
  });

  // S-2: AuthRefreshDiscardedError は「サーバーはリフレッシュに成功したが、
  // ローカルのセッション状態が途中で変わった（例: 別タブでの同時 signOut）
  // ため保存を見送った」ことを示す benign な競合状態であり、トークン自体が
  // 無効なわけではない。fail open 側に分類され、redirect しない。
  it("getClaims が AuthRefreshDiscardedError 付きで resolve しても fail open で通過させる", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimsError = new AuthRefreshDiscardedError();
    getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    errorSpy.mockRestore();
  });

  // S-3: いずれの型ガード（Retryable / RefreshDiscarded）も満たさない resolve
  // エラー（例: AuthInvalidJwtError）は、本 change の核となる discriminator。
  // 旧実装（error !== null なら常に fail open）ではこのケースも通過して
  // しまっていたが、新実装では「判定不能」ではなく「未ログイン確定」として
  // 扱われ、保護ルートでは /login へ redirect する。
  it("S-3: getClaims が AuthInvalidJwtError 付きで resolve した場合、保護ルートでは /login へリダイレクトする", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimsError = new AuthInvalidJwtError("Token signature is invalid");
    getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/stock-items"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/login");
    errorSpy.mockRestore();
  });

  // S-3 非保護ルート版（回帰チェック）: isDefinitelyUnauthenticated が true に
  // なっても、matchesPath(..., PROTECTED_PATHS) が false なら redirect しない
  // という既存の AND ゲートは本 change で変更していない。
  it("S-3非保護ルート: getClaims が AuthInvalidJwtError 付きで resolve しても非保護ルートではリダイレクトしない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const claimsError = new AuthInvalidJwtError("Token signature is invalid");
    getClaimsMock.mockResolvedValue({ data: null, error: claimsError });
    const { middleware } = await import("./middleware");

    const res = await middleware(makeRequest("/health"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    errorSpy.mockRestore();
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
