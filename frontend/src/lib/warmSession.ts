import { createClient, type Session } from "@supabase/supabase-js";

// リフレッシュ判定の余裕時間。アクセストークンの残り有効期限がこれ以下の
// ときは再利用せず、この呼び出し内でリフレッシュ/再ログインする。
const REFRESH_MARGIN_SECONDS = 5 * 60;

// cron-job.org が2分間隔でこのモジュールを含む Route Handler を呼び出す
// ことで、このモジュールスコープ変数自体がコンテナ生存期間中キャッシュとして
// 機能する（design.md 参照）。あるリクエストのセッションを別のリクエストが
// 再利用しても問題ない単一の warm-only ユーザーのセッションであるため、
// createSupabaseServerClient.ts と異なりモジュールスコープキャッシュを
// 意図的に持つ。
let cachedSession: Session | null = null;

function isNearExpiry(session: Session): boolean {
  if (!session.expires_at) return true;
  const remainingSeconds = session.expires_at - Math.floor(Date.now() / 1000);
  return remainingSeconds <= REFRESH_MARGIN_SECONDS;
}

export async function getWarmSession(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<Session> {
  if (cachedSession && !isNearExpiry(cachedSession)) {
    return cachedSession;
  }

  // このクライアントは per-request の cookie 保持者ではなく、モジュールスコープの
  // 変数で明示的にセッションを管理するサービス的な呼び出し元（design.md 参照）。
  // デフォルトの persistSession/autoRefreshToken は「使われないメモリストレージへの
  // 書き込み」「呼び出しごとの裏側リフレッシュタイマー」を生むだけなので無効化する。
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (cachedSession) {
    // refreshSession は reject もありうる（ネットワークエラー等）ため、
    // エラーレスポンスと例外の両方を「リフレッシュ失敗」として同じ
    // フォールバック（新規サインイン）に合流させる。
    try {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: cachedSession.refresh_token,
      });
      if (!error && data.session) {
        cachedSession = data.session;
        return cachedSession;
      }
    } catch {
      // フォールバックへ進む
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(
      `warm user sign-in failed: ${error?.message ?? "no session returned"}`,
    );
  }
  cachedSession = data.session;
  return cachedSession;
}
