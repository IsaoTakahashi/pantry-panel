import fs from "node:fs";
import path from "node:path";

import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

async function globalSetup() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  let testGroupId = process.env.E2E_TEST_GROUP_ID;
  const backendUrl = process.env.PREVIEW_BACKEND_URL || "http://localhost:8080";

  if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
    throw new Error(
      "E2E env vars not set: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, " +
        "E2E_TEST_EMAIL, E2E_TEST_PASSWORD",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session) {
    throw new Error(
      `Supabase sign-in failed: ${error?.message ?? "no session returned"}`,
    );
  }

  // E2E_TEST_GROUP_ID 未指定時は CI run 毎に新規 group を作る。
  // 並走する PR 同士で同じグループに書き込んで衝突するのを防ぐため。
  // ローカル開発は .env.e2e に固定 ID を入れて従来通り再利用できる。
  const ephemeral = !testGroupId;
  if (!testGroupId) {
    const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
    const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";
    const groupName = `e2e-${runId}-${runAttempt}`;
    const createResp = await fetch(`${backendUrl}/api/groups`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: groupName }),
    });
    if (!createResp.ok) {
      throw new Error(
        `POST /api/groups failed: ${createResp.status} ${await createResp.text()}`,
      );
    }
    const group = (await createResp.json()) as { id: string };
    testGroupId = group.id;
    console.log(`globalSetup: created ephemeral test group ${testGroupId}`);
  }

  // @supabase/ssr のセッション cookie キー: sb-{project-ref}-auth-token
  // (localStorage 時代と同じキーだが、格納先が cookie に変わっている)
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieKey = `sb-${projectRef}-auth-token`;
  const origin = new URL(process.env.PREVIEW_URL || "http://localhost:3000")
    .origin;
  const originUrl = new URL(origin);

  // @supabase/ssr のデフォルト cookieEncoding ("base64url") に合わせてエンコードする。
  // このアプリの createBrowserClient/createServerClient はどちらも cookieEncoding を
  // 指定していないためデフォルトが使われる（frontend/src/lib/supabaseClient.ts,
  // frontend/src/lib/supabaseServerClient.ts で確認済み）。
  const encodedValue = `base64-${stringToBase64URL(JSON.stringify(data.session))}`;
  // MAX_CHUNK_SIZE を超える場合は sb-{ref}-auth-token.0 / .1 / ... に分割される。
  // 分割アルゴリズムは自前実装せず @supabase/ssr の実装をそのまま使う。
  const chunks = createChunks(cookieKey, encodedValue);

  const secure = originUrl.protocol === "https:";
  const expires = Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60;

  const storageState = {
    cookies: [
      ...chunks.map((chunk) => ({
        name: chunk.name,
        value: chunk.value,
        domain: originUrl.hostname,
        path: "/",
        expires,
        httpOnly: false,
        secure,
        sameSite: "Lax" as const,
      })),
      {
        name: "pantry-panel-active-group",
        value: testGroupId,
        domain: originUrl.hostname,
        path: "/",
        expires,
        httpOnly: false,
        secure,
        sameSite: "Lax" as const,
      },
    ],
    origins: [
      {
        origin,
        localStorage: [
          { name: "pantry-panel:active-group-id", value: testGroupId },
        ],
      },
    ],
  };

  const authDir = path.join(process.cwd(), ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(
    path.join(authDir, "user.json"),
    JSON.stringify(storageState, null, 2),
  );

  // teardown が group ID を参照できるよう書き出す。
  // ephemeral フラグは将来 DELETE /api/groups/:id が実装されたときに
  // 動的作成 group のみ削除するための識別に使う。
  fs.writeFileSync(
    path.join(authDir, "group.json"),
    JSON.stringify({ id: testGroupId, ephemeral }),
  );
}

export default globalSetup;
