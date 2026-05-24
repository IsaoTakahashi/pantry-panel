import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

async function globalTeardown() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  const testGroupId = process.env.E2E_TEST_GROUP_ID;
  const backendUrl = process.env.PREVIEW_BACKEND_URL || "http://localhost:8080";

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

  try {
    fs.rmSync(path.join(process.cwd(), ".auth"), { recursive: true });
  } catch {}
}

export default globalTeardown;
