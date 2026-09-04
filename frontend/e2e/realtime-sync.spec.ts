import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const AUTH_FILE = path.join(__dirname, "../.auth/user.json");

// networkidle は Realtime の phx_join ハンドシェイクを捉えない（既に開いている
// WebSocket 上を流れるため）。実際の購読完了シグナルとして window フラグを待つ。
async function waitForRealtimeSubscription(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>)
        .__supabaseRealtimeSubscribed === true,
    { timeout: 30000 },
  );
}

// global-teardown.ts のクリーンアップと同じ認証・グループ解決パターン
// （signInWithPassword → .auth/group.json → E2E_TEST_GROUP_ID）を使うが、
// スイート全体ではなくこの spec 用の1アイテムだけを対象にするスコープ限定版。
// テスト実行中は同じトークンを使い回すためキャッシュする。
let cachedAuth: { accessToken: string; groupId: string } | null = null;

async function getTestAuth(): Promise<{
  accessToken: string;
  groupId: string;
} | null> {
  if (cachedAuth) return cachedAuth;

  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;

  const groupFile = path.join(process.cwd(), ".auth", "group.json");
  let groupId: string | undefined;
  if (fs.existsSync(groupFile)) {
    const parsed = JSON.parse(fs.readFileSync(groupFile, "utf8")) as {
      id: string;
    };
    groupId = parsed.id;
  } else {
    groupId = process.env.E2E_TEST_GROUP_ID;
  }

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !testEmail ||
    !testPassword ||
    !groupId
  ) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !session) {
    console.warn(
      "realtime-sync cleanup: auth failed, skipping cleanup:",
      error?.message,
    );
    return null;
  }

  cachedAuth = { accessToken: session.access_token, groupId };
  return cachedAuth;
}

// retry で group 全体が先頭からやり直されるとき、前回試行の残留アイテムが
// 残ったままだと Page B の初回 REST フェッチだけで assertion が通ってしまい、
// Realtime 配信を検証しないまま false-positive で pass する。試行の先頭
// （INSERT テスト）の前に同名アイテムを削除し、必ずクリーンな状態から
// 始める。
async function deleteLeftoverItem(itemName: string): Promise<void> {
  const auth = await getTestAuth();
  if (!auth) return;

  const backendUrl = process.env.PREVIEW_BACKEND_URL || "http://localhost:8080";
  const headers: HeadersInit = {
    Authorization: `Bearer ${auth.accessToken}`,
    "X-Active-Group-ID": auth.groupId,
    "Content-Type": "application/json",
  };

  const listResp = await fetch(`${backendUrl}/api/stock-items`, { headers });
  if (!listResp.ok) {
    console.warn(
      "realtime-sync cleanup: GET /api/stock-items failed:",
      listResp.status,
    );
    return;
  }

  const items: { id: string; name: string; wantToBuy: boolean }[] =
    await listResp.json();
  const leftover = items.find((item) => item.name === itemName);
  if (!leftover) return;

  // DELETE は wantToBuy=false が必要なため、先に PATCH する
  if (leftover.wantToBuy) {
    await fetch(`${backendUrl}/api/stock-items/${leftover.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ wantToBuy: false }),
    });
  }
  const deleteResp = await fetch(
    `${backendUrl}/api/stock-items/${leftover.id}`,
    {
      method: "DELETE",
      headers,
    },
  );
  if (!deleteResp.ok) {
    console.warn(
      "realtime-sync cleanup: DELETE /api/stock-items/:id failed:",
      deleteResp.status,
    );
  }
}

test.describe
  .serial("Realtime sync", () => {
    // retry で失敗した group 全体が先頭からやり直されるという、この project の
    // Realtime 配信には既知の断続的な遅延がある（Issue #247、未解決の
    // インフラ特性として許容）。以下の beforeAll によって各試行が必ずクリーンな
    // 状態から始まる保証ができたので、その断続的な遅延を素直な retry で
    // 吸収するために project 標準の 1 回より高い予算を設定する。
    test.describe.configure({ retries: 3 });

    const itemName = "Realtime Test Item";

    // test.beforeEach ではなく beforeAll を使う: .serial block の retry は
    // グループ全体が先頭 (INSERT テスト) からやり直される単位であり、
    // beforeAll はその「試行」ごとに再実行される（beforeEach だと個々の
    // テストの間でも発火してしまい、INSERT テストが作った直後のアイテムを
    // 同一試行内の wantToBuy トグル/DELETE テストの前に消してしまう）。
    test.beforeAll(async () => {
      await deleteLeftoverItem(itemName);
    });

    test("Context A で INSERT → Context B にカードが出現する", async ({
      browser,
    }) => {
      const ctxA = await browser.newContext({ storageState: AUTH_FILE });
      const ctxB = await browser.newContext({ storageState: AUTH_FILE });
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await Promise.all([
        waitForRealtimeSubscription(pageA),
        waitForRealtimeSubscription(pageB),
      ]);

      // Context A で新規作成
      await pageA.getByRole("button", { name: "商品を追加" }).click();
      const dialog = pageA.getByRole("dialog");
      await dialog.getByLabel("名前").fill(itemName);
      await dialog
        .getByLabel("カテゴリ", { exact: true })
        .selectOption("調味料");
      await dialog.getByRole("button", { name: "追加", exact: true }).click();
      await expect(pageA.getByText(itemName)).toBeVisible();
      await expect(pageB.getByText(itemName)).toBeVisible({
        timeout: 10000,
      });

      await ctxA.close();
      await ctxB.close();
    });

    test("Context A で wantToBuy トグル → Context B で aria-pressed が変化する", async ({
      browser,
    }) => {
      const ctxA = await browser.newContext({ storageState: AUTH_FILE });
      const ctxB = await browser.newContext({ storageState: AUTH_FILE });
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await Promise.all([
        waitForRealtimeSubscription(pageA),
        waitForRealtimeSubscription(pageB),
      ]);

      await expect(pageA.getByText(itemName)).toBeVisible();
      await expect(pageB.getByText(itemName)).toBeVisible();

      const toggleButton = (page: Page) =>
        page
          .getByRole("article", {
            name: itemName,
          })
          .getByRole("button", {
            name: "want to buy",
          });

      const pageAToggleButton = toggleButton(pageA);
      await expect(pageAToggleButton).toHaveAttribute("aria-pressed", "false");
      const pageBToggleButton = toggleButton(pageB);
      await expect(pageBToggleButton).toHaveAttribute("aria-pressed", "false");

      await pageAToggleButton.click();
      await expect(pageAToggleButton).toHaveAttribute("aria-pressed", "true");
      await expect(pageBToggleButton).toHaveAttribute("aria-pressed", "true", {
        timeout: 10000,
      });

      await pageAToggleButton.click();
      await expect(pageAToggleButton).toHaveAttribute("aria-pressed", "false");
      await expect(pageBToggleButton).toHaveAttribute("aria-pressed", "false", {
        timeout: 10000,
      });

      await ctxA.close();
      await ctxB.close();
    });

    test("Context A で DELETE → Context B からカードが消える", async ({
      browser,
    }) => {
      const ctxA = await browser.newContext({ storageState: AUTH_FILE });
      const ctxB = await browser.newContext({ storageState: AUTH_FILE });
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await Promise.all([
        waitForRealtimeSubscription(pageA),
        waitForRealtimeSubscription(pageB),
      ]);

      await expect(pageA.getByText(itemName)).toBeVisible();
      await expect(pageB.getByText(itemName)).toBeVisible();

      await pageA
        .getByRole("article", {
          name: itemName,
        })
        .getByRole("button", { name: "削除" })
        .click();
      // ConfirmDialog opens — click the confirm button
      await pageA.getByRole("button", { name: "確認" }).click();
      await expect(pageA.getByRole("dialog")).not.toBeAttached();
      await expect(pageA.getByText(itemName)).not.toBeVisible();

      await expect(pageB.getByText(itemName)).not.toBeVisible({
        timeout: 10000,
      });

      await ctxA.close();
      await ctxB.close();
    });
  });
