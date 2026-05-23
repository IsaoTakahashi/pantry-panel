import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

async function globalSetup() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  const testGroupId = process.env.E2E_TEST_GROUP_ID;

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !testEmail ||
    !testPassword ||
    !testGroupId
  ) {
    throw new Error(
      "E2E env vars not set: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, " +
        "E2E_TEST_EMAIL, E2E_TEST_PASSWORD, E2E_TEST_GROUP_ID",
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

  // Supabase JS v2 のローカルストレージキー: sb-{project-ref}-auth-token
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const sessionKey = `sb-${projectRef}-auth-token`;
  const baseURL = process.env.PREVIEW_URL || "http://localhost:3000";

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: baseURL,
        localStorage: [
          { name: sessionKey, value: JSON.stringify(data.session) },
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
}

export default globalSetup;
