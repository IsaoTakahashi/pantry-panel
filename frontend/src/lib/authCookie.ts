// @supabase/ssr の cookie 名パターン。project ref を含むため固定名では
// 拾えず、かつ大きなセッションはチャンク分割される（`.0`, `.1` ...）ため
// 数値サフィックスも許容する（Issue #260）。
export const AUTH_TOKEN_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;
