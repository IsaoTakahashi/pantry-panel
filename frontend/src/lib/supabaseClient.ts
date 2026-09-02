import type { SupabaseClient } from "@supabase/supabase-js";

function loadClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("Supabase env vars not set, realtime disabled");
    return Promise.resolve(null);
  }
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key),
  );
}

// モジュール評価時(＝最初にこのファイルが import された時点)に即座に発火する。
// 呼び出し元の実際の getSupabaseClient() 呼び出しタイミングを待たない。
const _clientPromise = loadClient();

export function getSupabaseClient(): Promise<SupabaseClient | null> {
  return _clientPromise;
}
