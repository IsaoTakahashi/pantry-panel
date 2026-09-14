import { stringToBase64URL } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStockItems } from "@/lib/api";
import { buildSessionCookies } from "@/lib/sessionCookie";
import type { StockItem } from "@/types/stockItem";

const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
const ACTIVE_GROUP_COOKIE = "pantry-panel-active-group";
const INITIAL_ITEMS_HEADER_NAME = "x-pp-initial-items";

const mockCookiesGet = vi.fn();
const mockHeadersGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookiesGet }),
  headers: () => Promise.resolve({ get: mockHeadersGet }),
}));

vi.mock("@/lib/api", () => ({ fetchStockItems: vi.fn() }));

// stock-items-ttfb-reduction Phase 2 (tasks.md 3.1): getInitialStockItems.ts は
// もう Supabase クライアントを一切生成・呼び出してはならない
// （middleware が検証・リフレッシュ済みの cookie から直接 access_token を
// 読み取るようになったため）。createSupabaseServerClient をモックして spy し、
// このモジュールが一度も呼んでいないことを確認する。
const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

function cookieMap(entries: Record<string, string>) {
  return (name: string) =>
    name in entries ? { value: entries[name] } : undefined;
}

function authTokenCookieEntries(accessToken: string): Record<string, string> {
  const session = { access_token: accessToken } as unknown as Session;
  const cookies = buildSessionCookies(SUPABASE_URL, session);
  return Object.fromEntries(cookies.map((c) => [c.name, c.value]));
}

function encodeInitialItemsHeader(items: unknown): string {
  return stringToBase64URL(JSON.stringify(items));
}

describe("getInitialStockItems", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("cookie未設定のとき null を返し、fetchStockItems を呼ばない", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(cookieMap({}));
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("auth-token cookie が無いとき null を返し、fetchStockItems を呼ばない", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({ [ACTIVE_GROUP_COOKIE]: "group-1" }),
    );
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("cookieとauth-tokenが揃っているとき fetchStockItems の結果を返す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({
        [ACTIVE_GROUP_COOKIE]: "group-1",
        ...authTokenCookieEntries("tok"),
      }),
    );
    const items = [
      {
        id: "1",
        name: "商品A",
        category: "調味料",
        imageUrl: null,
        sourceUrl: null,
        wantToBuy: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        sortedAt: "2026-01-01T00:00:00Z",
      },
    ];
    vi.mocked(fetchStockItems).mockResolvedValue(items);
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toEqual(items);
    expect(fetchStockItems).toHaveBeenCalledWith("tok", "group-1");
  });

  it("createSupabaseServerClient を一度も呼ばない（Supabaseへの呼び出しが発生しないことの確認）", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({
        [ACTIVE_GROUP_COOKIE]: "group-1",
        ...authTokenCookieEntries("tok"),
      }),
    );
    vi.mocked(fetchStockItems).mockResolvedValue([]);
    const { getInitialStockItems } = await import("./getInitialStockItems");

    await getInitialStockItems();

    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("fetchStockItems が失敗したら null を返す（エラーを投げない）", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({
        [ACTIVE_GROUP_COOKIE]: "group-1",
        ...authTokenCookieEntries("tok"),
      }),
    );
    vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
  });

  it("auth-token cookie の値が不正(JSON parse失敗)のとき null を返し、fetchStockItems を呼ばない", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    mockCookiesGet.mockImplementation(
      cookieMap({
        [ACTIVE_GROUP_COOKIE]: "group-1",
        "sb-abcdefghijklmnop-auth-token": "not-valid",
      }),
    );
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("Supabase env未設定（NEXT_PUBLIC_SUPABASE_URL無し）のとき null を返す", async () => {
    mockCookiesGet.mockImplementation(
      cookieMap({ [ACTIVE_GROUP_COOKIE]: "group-1" }),
    );
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  // Phase 0 (tasks.md 1.2) の観測性を Phase 2 の実装（getSession() 廃止）に
  // 合わせて更新する。getSession の代わりに access_token を cookie から直接
  // 読み取る区間（readAccessTokenFromCookies）の所要時間を計測・ログ出力する。
  describe("観測性: readAccessTokenFromCookies/fetchStockItems の所要時間をログ出力する", () => {
    it("cookieとauth-tokenが揃っているとき、両区間の所要時間がログ出力される", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCookiesGet.mockImplementation(
        cookieMap({
          [ACTIVE_GROUP_COOKIE]: "group-1",
          ...authTokenCookieEntries("tok"),
        }),
      );
      vi.mocked(fetchStockItems).mockResolvedValue([]);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/readAccessTokenFromCookies.*dur=\d+(\.\d+)?/),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/fetchStockItems.*dur=\d+(\.\d+)?/),
      );
      logSpy.mockRestore();
    });

    it("auth-token cookie が無いとき、readAccessTokenFromCookies の所要時間のみログ出力され fetchStockItems 分は出力されない", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCookiesGet.mockImplementation(
        cookieMap({ [ACTIVE_GROUP_COOKIE]: "group-1" }),
      );
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/readAccessTokenFromCookies.*dur=\d+(\.\d+)?/),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/fetchStockItems.*dur=\d+(\.\d+)?/),
      );
      logSpy.mockRestore();
    });

    it("fetchStockItems が reject したとき、console.error でエラーが記録される", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockCookiesGet.mockImplementation(
        cookieMap({
          [ACTIVE_GROUP_COOKIE]: "group-1",
          ...authTokenCookieEntries("tok"),
        }),
      );
      const fetchError = new Error("HTTP 500");
      vi.mocked(fetchStockItems).mockRejectedValue(fetchError);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      await getInitialStockItems();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("fetchStockItems"),
        fetchError,
      );
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  // stock-items-ttfb-reduction Phase 2 (tasks.md 5.1): middleware が並行取得
  // した在庫データを x-pp-initial-items ヘッダーで渡してきた場合、それを
  // そのまま使い、追加の Supabase 呼び出し・Lambda 呼び出しを一切行わない。
  describe("x-pp-initial-items ヘッダーの読み取り（middlewareからの事前取得データ）", () => {
    it("ヘッダーが存在するとき、そのデータをそのまま返し、cookie・fetchStockItemsを一切呼ばない", async () => {
      const items: StockItem[] = [
        {
          id: "1",
          name: "商品A",
          category: "調味料",
          imageUrl: null,
          sourceUrl: null,
          wantToBuy: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          sortedAt: "2026-01-01T00:00:00Z",
        },
      ];
      mockHeadersGet.mockImplementation((name: string) =>
        name === INITIAL_ITEMS_HEADER_NAME
          ? encodeInitialItemsHeader(items)
          : undefined,
      );
      const { getInitialStockItems } = await import("./getInitialStockItems");

      const result = await getInitialStockItems();

      expect(result).toEqual(items);
      expect(mockCookiesGet).not.toHaveBeenCalled();
      expect(fetchStockItems).not.toHaveBeenCalled();
    });

    it("ヘッダーの中身が空配列のときも、空配列をそのまま返す（0件は有効なデータであり、フォールバックしてはならない）", async () => {
      mockHeadersGet.mockImplementation((name: string) =>
        name === INITIAL_ITEMS_HEADER_NAME
          ? encodeInitialItemsHeader([])
          : undefined,
      );
      const { getInitialStockItems } = await import("./getInitialStockItems");

      const result = await getInitialStockItems();

      expect(result).toEqual([]);
      expect(fetchStockItems).not.toHaveBeenCalled();
    });
  });

  // stock-items-ttfb-reduction Phase 2 (tasks.md 5.2): ヘッダーが存在しない
  // 場合（サイズ超過・フェッチ失敗・middleware側の異常等）は、既存の
  // cookieベースのフォールバック取得を行う。フォールバックは認証検証を
  // やり直さない（spec.md MUST: 既に検証済みのセッション情報を再利用する。
  // readAccessTokenFromCookies は Supabase を呼ばずローカルの cookie を
  // 読むだけであり、この要件を満たす）。
  describe("x-pp-initial-items ヘッダーが無いときのフォールバック取得", () => {
    it("ヘッダーが存在しないとき、cookieベースのフォールバック取得が行われる", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      mockHeadersGet.mockReturnValue(undefined);
      mockCookiesGet.mockImplementation(
        cookieMap({
          [ACTIVE_GROUP_COOKIE]: "group-1",
          ...authTokenCookieEntries("tok"),
        }),
      );
      const items: StockItem[] = [];
      vi.mocked(fetchStockItems).mockResolvedValue(items);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      const result = await getInitialStockItems();

      expect(result).toEqual(items);
      expect(fetchStockItems).toHaveBeenCalledWith("tok", "group-1");
    });

    it("ヘッダーの値がbase64/JSONとしてデコードできないとき、フォールバック取得が行われる（middleware側の異常等）", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      mockHeadersGet.mockImplementation((name: string) =>
        name === INITIAL_ITEMS_HEADER_NAME ? "not-a-valid-value" : undefined,
      );
      mockCookiesGet.mockImplementation(
        cookieMap({
          [ACTIVE_GROUP_COOKIE]: "group-1",
          ...authTokenCookieEntries("tok"),
        }),
      );
      const items: StockItem[] = [];
      vi.mocked(fetchStockItems).mockResolvedValue(items);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      const result = await getInitialStockItems();

      expect(result).toEqual(items);
      expect(fetchStockItems).toHaveBeenCalledWith("tok", "group-1");
    });

    it("ヘッダーの値が配列でないJSONのとき、フォールバック取得が行われる", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
      mockHeadersGet.mockImplementation((name: string) =>
        name === INITIAL_ITEMS_HEADER_NAME
          ? encodeInitialItemsHeader({ not: "an array" })
          : undefined,
      );
      mockCookiesGet.mockImplementation(
        cookieMap({
          [ACTIVE_GROUP_COOKIE]: "group-1",
          ...authTokenCookieEntries("tok"),
        }),
      );
      const items: StockItem[] = [];
      vi.mocked(fetchStockItems).mockResolvedValue(items);
      const { getInitialStockItems } = await import("./getInitialStockItems");

      const result = await getInitialStockItems();

      expect(result).toEqual(items);
      expect(fetchStockItems).toHaveBeenCalledWith("tok", "group-1");
    });
  });
});
