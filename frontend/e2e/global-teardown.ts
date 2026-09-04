import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

async function globalTeardown() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  const backendUrl = process.env.PREVIEW_BACKEND_URL || "http://localhost:8080";

  // 動的作成された group の ID は global-setup が .auth/group.json に書き出す。
  // env 指定（ローカル開発の固定 ID）の場合はこのファイルが存在しないため、
  // isDynamicGroup で分岐して動的作成 group のみ DELETE /api/groups/:id の対象にする。
  const groupFile = path.join(process.cwd(), ".auth", "group.json");
  const isDynamicGroup = fs.existsSync(groupFile);
  let testGroupId: string | undefined;
  if (isDynamicGroup) {
    const parsed = JSON.parse(fs.readFileSync(groupFile, "utf8")) as {
      id: string;
    };
    testGroupId = parsed.id;
  } else {
    testGroupId = process.env.E2E_TEST_GROUP_ID;
  }

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !testEmail ||
    !testPassword ||
    !testGroupId
  ) {
    return;
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
      "globalTeardown: auth failed, skipping cleanup:",
      error?.message,
    );
    return;
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${session.access_token}`,
    "X-Active-Group-ID": testGroupId,
    "Content-Type": "application/json",
  };

  const listResp = await fetch(`${backendUrl}/api/stock-items`, { headers });
  if (!listResp.ok) {
    console.warn(
      "globalTeardown: GET /api/stock-items failed:",
      listResp.status,
    );
    return;
  }

  const items: { id: string; wantToBuy: boolean }[] = await listResp.json();

  for (const item of items) {
    // DELETE は wantToBuy=false が必要なため、先に PATCH する
    if (item.wantToBuy) {
      await fetch(`${backendUrl}/api/stock-items/${item.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ wantToBuy: false }),
      });
    }
    await fetch(`${backendUrl}/api/stock-items/${item.id}`, {
      method: "DELETE",
      headers,
    });
  }

  if (isDynamicGroup) {
    try {
      const deleteGroupResp = await fetch(
        `${backendUrl}/api/groups/${testGroupId}`,
        {
          method: "DELETE",
          headers,
        },
      );
      if (!deleteGroupResp.ok) {
        console.warn(
          "globalTeardown: DELETE /api/groups/:id failed:",
          deleteGroupResp.status,
        );
      }
    } catch (err) {
      console.warn("globalTeardown: DELETE /api/groups/:id threw:", err);
    }
  }

  try {
    fs.rmSync(path.join(process.cwd(), ".auth"), { recursive: true });
  } catch {}
}

export default globalTeardown;
