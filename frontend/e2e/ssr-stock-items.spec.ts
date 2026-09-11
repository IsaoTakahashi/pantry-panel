import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
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

      // toBeVisible() (DOM可視性) ではなく、レスポンス本文そのものに商品名が
      // 含まれるかを直接検証する。streaming SSR (Suspense boundary) は
      // 内容を一旦 hidden template として送り、JS 側のインラインスクリプトが
      // 所定位置へ差し替えるまで可視化されない。javaScriptEnabled: false では
      // このスクリプトが動かないため、実際には初期HTMLに商品名が含まれていても
      // toBeVisible() は "hidden" のまま失敗しうる（本タスクが検証したいのは
      // JS実行前の初期HTMLレスポンスそのものであり、可視化タイミングではない）。
      const response = await page.goto("/stock-items");
      if (!response) throw new Error("no response from /stock-items");
      expect(await response.text()).toContain(itemName);

      await context.close();
    } finally {
      await cleanup();
    }
  });
});
