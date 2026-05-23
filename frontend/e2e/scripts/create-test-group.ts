/**
 * E2E テスト用グループを一度だけ作成するセットアップスクリプト。
 *
 * 実行方法:
 *   # 1. frontend/.env.e2e を用意（E2E_TEST_GROUP_ID 以外を埋める）
 *   # 2. バックエンドを起動
 *   source frontend/.env.e2e && cd backend && go run .
 *   # 3. このスクリプトを実行（別ターミナルで）
 *   cd frontend && node --experimental-strip-types e2e/scripts/create-test-group.ts
 *   # 4. 出力された UUID を .env.e2e の E2E_TEST_GROUP_ID に設定する
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, "../../.env.e2e");
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const supabaseUrl = process.env.E2E_SUPABASE_URL;
const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const backendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

if (!supabaseUrl || !supabaseAnonKey || !email || !password) {
  console.error(
    "Error: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_TEST_EMAIL, E2E_TEST_PASSWORD を .env.e2e に設定してください",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

if (error || !data.session) {
  console.error("Supabase サインイン失敗:", error?.message ?? "no session");
  process.exit(1);
}

const res = await fetch(`${backendUrl}/api/groups`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${data.session.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: "E2E Test Group" }),
});

if (!res.ok) {
  console.error("POST /api/groups 失敗:", res.status, await res.text());
  process.exit(1);
}

const group = (await res.json()) as { id: string; name: string };

console.log("✅ テストグループを作成しました");
console.log("");
console.log("frontend/.env.e2e に以下を追加してください:");
console.log(`E2E_TEST_GROUP_ID=${group.id}`);
