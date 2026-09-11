## Why

`middleware.ts` は確定的に無効なトークン（`isDefinitelyUnauthenticated`）を検知すると `/login` へリダイレクトするが、`sb-*-auth-token` 系のセッション cookie をクリアしない。一方 `/login` は `EXCLUDED_PATHS` として middleware を素通りし、`LoginContent` はブラウザ側の `getSession()`（cookie ベース、署名検証なし）を見てセッションが「ありそう」なら `/stock-items` へ push し直す。middleware と client の「有効性」判定が食い違うケース（署名鍵ローテーション直後、resolve される一時的な非 retryable エラーなど）で `/login` ↔ `/stock-items` の無限リダイレクトループが起こりうる（fail-closed のため深刻なセキュリティ問題ではないが UX 上のループ）。PR #259 の最終ブランチ全体レビューで発見された Important 指摘（Issue #260）。

## What Changes

- `middleware.ts` が `isDefinitelyUnauthenticated` による `/login` redirect を行う際、`redirectResponse` 上で `sb-*-auth-token` 系の cookie（チャンク化された `.0`, `.1` ... を含む）を明示的に失効させる
- 確定的に無効と判定されたセッションの cookie を残さないことで、client 側 `getSession()` が同じ cookie を見て `/stock-items` に押し戻す経路を断ち、redirect ループの根を絶つ

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ssr-session-auth`: 「middleware は未ログイン時に保護ルートから /login へリダイレクトする」Requirement に、確定的無効トークンの cookie を redirect 時にクリアする振る舞いを追加する

## Impact

- `frontend/src/middleware.ts`（`isDefinitelyUnauthenticated` の redirect 分岐、156-172行目付近）
- `frontend/src/middleware.test.ts`（既存 S-3 相当シナリオの拡張。新規 E2E は不要 — ブラウザ起動なしで Vitest のみで検証可能）
- 副作用として `frontend/src/app/login/page.tsx`（`LoginContent`）の redirect-back 判定への影響を軽減するが、当該ファイル自体は変更しない
