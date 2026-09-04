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

// 解決済みクライアントのキャッシュ。undefined = 未解決、null = 無効
// （env 未設定）、SupabaseClient = 利用可能。peekSupabaseClient() が
// 同期的に参照する。
let _resolvedClient: SupabaseClient | null | undefined;

// モジュール評価時(＝最初にこのファイルが import された時点)に即座に発火する。
// 呼び出し元の実際の getSupabaseClient() 呼び出しタイミングを待たない。
// あえて .catch() を付けていない: 動的 import が失敗した場合はここで握りつぶさず
// unhandled rejection として window に伝播させ、frontend/src/lib/chunkLoadRecovery.ts
// のグローバルリカバリ機構(SW更新+リロード)にチャンクロード失敗として検出させる。
// ここで繋いでいる .then() は成功時に _resolvedClient を埋めるだけで onRejected を
// 持たないため、loadClient() が reject した場合は素通りして _clientPromise 自体が
// reject する(＝ハンドラを付けずに待つ呼び出し元がいなければ従来どおり unhandled
// rejection として伝播する)。挙動は変わらない。
const _clientPromise = loadClient().then((client) => {
  _resolvedClient = client;
  return client;
});

export function getSupabaseClient(): Promise<SupabaseClient | null> {
  return _clientPromise;
}

// 既に解決済みの場合にのみ同期的にクライアントを返す。未解決なら undefined
// を返す（呼び出し元は getSupabaseClient() の非同期パスにフォールバックする）。
// 呼び出し元がマウントされる時点で必ず解決済みである保証はない（詳細は
// useStockItemsRealtime.ts の呼び出し箇所コメント、Issue #247 参照）。
export function peekSupabaseClient(): SupabaseClient | null | undefined {
  return _resolvedClient;
}
