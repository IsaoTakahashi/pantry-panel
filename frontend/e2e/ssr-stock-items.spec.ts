import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Issue #182: middleware→layout→AuthContext→AuthGuard→useStockItems→page.tsx
// の SSR 連鎖全体が正しく繋がっているかを検証する唯一のテスト。ここが無いと、
// 実装がクライアントフェッチに静かにフォールバックし続けていても、既存の
// E2E は最終描画状態への自動待機（toBeVisible 等）で書かれているため誰も
// 気づけない（testing.md 2026-09-04 の networkidle proxy の教訓と同種の穴）。

async function seedItem(
  itemName: string,
): Promise<{ cleanup: () => Promise<void> }> {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  const backendUrl = process.env.PREVIEW_BACKEND_URL || "http://localhost:8080";

  const groupFile = path.join(process.cwd(), ".auth", "group.json");
  const { id: groupId } = JSON.parse(fs.readFileSync(groupFile, "utf8")) as {
    id: string;
  };

  if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
    throw new Error("E2E env vars not set");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session) {
    throw new Error(`sign-in failed: ${error?.message}`);
  }

  const headers = {
    Authorization: `Bearer ${data.session.access_token}`,
    "X-Active-Group-ID": groupId,
    "Content-Type": "application/json",
  };

  const createResp = await fetch(`${backendUrl}/api/stock-items`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: itemName,
      category: "調味料",
      wantToBuy: false,
    }),
  });
  if (!createResp.ok) {
    throw new Error(`seed item failed: ${createResp.status}`);
  }
  const created = (await createResp.json()) as { id: string };

  return {
    cleanup: async () => {
      await fetch(`${backendUrl}/api/stock-items/${created.id}`, {
        method: "DELETE",
        headers,
      });
    },
  };
}

test.describe("SSR stock-items (Issue #182)", () => {
  test("cookie設定済み・有効なgroupIdのとき、JS実行前の初期HTMLに商品名が含まれる", async ({
    browser,
  }) => {
    // "確認"/"キャンセル" 等、UI のボタンラベルと部分一致しうる文字列は避ける
    // （getByRole の name は既定で部分一致するため、並行実行中の他 spec の
    // ロケータと衝突しうる。実際に "SSR確認用商品-" 名で他 spec の
    // getByRole('button', { name: '確認' }) が誤ヒットする事故が発生した）。
    const itemName = `ssr-seed-${Date.now()}`;
    const { cleanup } = await seedItem(itemName);

    try {
      // storageState はデフォルトプロジェクトの認証済み状態
      // (.auth/user.json、global-setup.ts で cookie/localStorage 両方に
      // active group が書き込み済み) をそのまま引き継ぐ。JS を無効化して
      // hydration前のSSR HTMLだけを見る。
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();

      // レスポンス本文 (`response.text()`) に対する toContain ではなく、
      // 描画された DOM を locator で検証する。
      // 理由: レスポンス本文には RSC の flight ペイロード
      // (`self.__next_f.push(...)`、hydration 用にNext.jsが埋め込む
      // シリアライズ済みデータ) が含まれるため、AuthGuard (Client Component) が
      // ゲートを開かず何も描画していなくても商品名は本文に現れる。つまり
      // 認証ブートストラップ連鎖が下流で壊れていても素通りしてしまい、
      // このテストが唯一検証すべき対象を何も検証できていなかった。
      // `article[aria-label=商品名]` は `ItemCard` が描画する要素そのもの
      // (src/components/ItemCard.tsx) であり、これが初期HTMLに存在することは
      // middleware→layout→AuthContext→AuthGuard→useStockItems→page.tsx の
      // 連鎖が全て繋がったことを意味する。
      // 以前あった「streaming SSR の hidden template により toBeVisible が
      // 失敗しうる」という懸念は、`stock-items/page.tsx` から `<Suspense>` 境界
      // 自体を削除したことで解消済み（`layout.tsx` の `export const instant =
      // false` は Cache Components のビルド時検証を無効化するだけで、この
      // streaming 挙動までは抑止しない。詳細は page.tsx のコメント参照）。
      // 初期HTMLは Suspense の fallback ではなく実データで返る。
      const response = await page.goto("/stock-items");
      if (!response) throw new Error("no response from /stock-items");
      await expect(page.getByRole("article", { name: itemName })).toBeVisible();

      await context.close();
    } finally {
      await cleanup();
    }
  });
});

// 実際にログインして得たセッションのうち、アクセストークンの署名部だけを
// 同じ長さの乱数に置き換えた storageState を組み立てる。header / payload
// （`exp`）と `expires_at` は期限内のまま残すため、middleware の getSession()
// は期限内として通し、署名を検証するのは Go API だけになる。
// activeGroupId cookie が無いと page は Go API を呼ばずに null を返し、
// 検証が空振りするため必ずセットする。
async function buildForgedStorageState(origin: string) {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
    throw new Error("E2E env vars not set");
  }
  const groupFile = path.join(process.cwd(), ".auth", "group.json");
  const { id: groupId } = JSON.parse(fs.readFileSync(groupFile, "utf8")) as {
    id: string;
  };

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session) {
    throw new Error(`sign-in failed: ${error?.message}`);
  }

  const [header, payload, signature] = data.session.access_token.split(".");
  const signatureBytes = Buffer.from(signature, "base64url").length;
  let forgedSignature = randomBytes(signatureBytes).toString("base64url");
  while (forgedSignature === signature) {
    forgedSignature = randomBytes(signatureBytes).toString("base64url");
  }
  const forgedSession = {
    ...data.session,
    access_token: `${header}.${payload}.${forgedSignature}`,
  };
  const { exp } = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as { exp: number };
  if (exp <= Math.floor(Date.now() / 1000) + 60) {
    throw new Error("access token is about to expire; forged test is invalid");
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieKey = `sb-${projectRef}-auth-token`;
  const originUrl = new URL(origin);
  const expires = Math.floor(Date.now() / 1000) + 60 * 60;
  const cookieBase = {
    domain: originUrl.hostname,
    path: "/",
    expires,
    httpOnly: false,
    secure: originUrl.protocol === "https:",
    sameSite: "Lax" as const,
  };
  const chunks = createChunks(
    cookieKey,
    `base64-${stringToBase64URL(JSON.stringify(forgedSession))}`,
  );

  return {
    groupId,
    storageState: {
      cookies: [
        ...chunks.map((chunk) => ({
          ...cookieBase,
          name: chunk.name,
          value: chunk.value,
        })),
        { ...cookieBase, name: "pantry-panel-active-group", value: groupId },
      ],
      origins: [
        {
          origin: originUrl.origin,
          localStorage: [
            { name: "pantry-panel:active-group-id", value: groupId },
          ],
        },
      ],
    },
  };
}

const AUTH_TOKEN_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

test.describe("SSR stock-items: 署名が不正なトークン (Issue #306)", () => {
  // Scenario: S-5
  test("S-5: 期限内だが署名が不正なトークンでは在庫が HTML に載らず、cookie が消されて /login に着地する", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is not configured");
    const itemName = `forged-sig-seed-${Date.now()}`;
    const { cleanup } = await seedItem(itemName);

    try {
      const { storageState } = await buildForgedStorageState(baseURL);
      // storageState はプロジェクト既定（.auth/user.json）を継承させず、
      // 明示的に渡す（decision-log 2026-09-10）
      const context = await browser.newContext({ storageState });

      // (1) リダイレクトを追わずに /stock-items の応答そのものを見る。
      // dev では redirect() が 307 になるが、本番ビルド（PPR の静的シェルを
      // 先に流すストリーミング応答）ではステータスが 200 で確定済みのため、
      // Next.js は RSC ペイロード内に redirect の digest
      // （`NEXT_REDIRECT;replace;/auth/clear-session;307;`）を埋め込み、
      // クライアントのルーターが遷移する。どちらの形でも行き先が
      // /auth/clear-session であることと、在庫が載らないことを確認する
      const direct = await context.request.get("/stock-items", {
        maxRedirects: 0,
      });
      const directBody = await direct.text();
      if (direct.status() >= 300 && direct.status() < 400) {
        expect(new URL(direct.headers().location ?? "", baseURL).pathname).toBe(
          "/auth/clear-session",
        );
      } else {
        expect(direct.status()).toBe(200);
        expect(directBody).toMatch(
          /NEXT_REDIRECT;(?:replace|push);\/auth\/clear-session;30[78];|http-equiv="refresh"[^>]*url=\/auth\/clear-session/,
        );
      }
      expect(directBody).not.toContain(itemName);

      // (2) JS 有効のブラウザで開き、/login に着地して留まることを確認する
      const page = await context.newPage();
      const documentBodies: string[] = [];
      page.on("response", async (response) => {
        if (response.request().resourceType() !== "document") return;
        if (response.status() >= 300 && response.status() < 400) return;
        documentBodies.push(await response.text().catch(() => ""));
      });

      await page.goto("/stock-items");
      await expect(page).toHaveURL(/\/login$/);
      // /login から /stock-items へ押し戻されるループが起きないこと
      await page.waitForTimeout(2_000);
      await expect(page).toHaveURL(/\/login$/);

      const remaining = (await context.cookies()).filter((cookie) =>
        AUTH_TOKEN_COOKIE.test(cookie.name),
      );
      expect(remaining).toEqual([]);
      for (const body of documentBodies) {
        expect(body).not.toContain(itemName);
      }
      await expect(page.getByText(itemName)).toHaveCount(0);

      await context.close();
    } finally {
      await cleanup();
    }
  });
});
