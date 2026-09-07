## Why

現在の認証は `@supabase/supabase-js` のブラウザ SDK 経由で、セッションを `localStorage` に保存している。Server Component（Next.js）はブラウザの `localStorage` を読めないため、サーバー側で認証状態を判断できず、未ログイン時のリダイレクトやデータ取得はすべてクライアント側 JS の実行を待つ必要がある（Issue #182）。これが `/stock-items` の初回表示を高速化する Server Component 化（Issue #182 Phase B）の前提を欠く根本原因になっている。

本 change は Issue #182 を Phase A（本 change）と Phase B に分割したうちの Phase A で、認証基盤を `@supabase/ssr` の cookie ベースに移行する。stock-items のデータ取得方式自体は変更しない（Phase B の対象）。

## What Changes

- `@supabase/supabase-js` のブラウザ SDK（`createClient`）を `@supabase/ssr` の `createBrowserClient`/`createServerClient` に置き換える。**BREAKING**: セッションの保存先が `localStorage` から cookie に変わるため、既存ユーザーは全員再ログインが必要になる
- `middleware.ts` を新設し、未ログイン時に保護ルートから `/login` へサーバー側でリダイレクトする。あわせて全リクエストでセッション cookie をリフレッシュする
- OAuth サインインフローを標準の PKCE + コールバックルート方式に置き換える（`app/auth/callback/route.ts` を新設し、`exchangeCodeForSession` でサーバー側にセッション cookie を書き込む）
- Issue #238/#245 で導入した Supabase SDK の動的 import（初回バンドルサイズ削減）はブラウザクライアント側で維持する
- `AuthGuard` の「未ログイン → `/login`」判定を削除し middleware に委譲する。「ログイン済みだが group 未所属 → `/no-group`」判定は group 所属確認に backend 呼び出しが必要なため、引き続き `AuthGuard`（クライアント側）に残す

## Capabilities

### New Capabilities
- `ssr-session-auth`: `@supabase/ssr` による cookie ベースのセッション管理、middleware でのセッションリフレッシュ・未ログインリダイレクト、OAuth コールバックルートの契約を定義する

### Modified Capabilities
- `auth-guard`: 「loading 完了後にセッションが無ければ `/login` へリダイレクトする」という既存 Requirement を削除する（middleware に責務が移るため）。「group が無ければ `/no-group` へリダイレクトする」他の Requirement は変更しない

## Impact

- `frontend/src/lib/supabaseClient.ts`（ブラウザクライアント生成の置き換え）
- `frontend/src/lib/supabaseServerClient.ts`（新規、サーバー側クライアント生成）
- `frontend/src/middleware.ts`（新規）
- `frontend/src/app/auth/callback/route.ts`（新規）
- `frontend/src/contexts/AuthContext.tsx`（クライアント取得部分の置き換えのみ、非同期パターン自体は維持）
- `frontend/src/components/AuthGuard.tsx`（未ログインリダイレクトの削除）
- `frontend/src/lib/useStockItemsRealtime.ts`（クライアント取得部分の置き換えのみ）
- `frontend/src/app/login/page.tsx`, `frontend/src/app/join/page.tsx`（サインインフローの `redirectTo` をコールバックルート経由に変更）
- `frontend/package.json`（`@supabase/ssr` 追加）
- backend への影響なし（引き続き `Authorization: Bearer <token>` の JWT を JWKS で検証するのみ）
- 影響範囲は認証フロー全体だが、stock-items のデータ取得方式・Realtime 購読ロジック自体は無変更


## ユーザーシナリオとテスト設計

シナリオ数が6件を超えるため `.claude/rules/testing.md` の基準に従い `e2e-design.md` に切り出した（S-1〜S-8、フロントエンドシナリオのみ・バックエンドシナリオなし）。詳細は [e2e-design.md](./e2e-design.md) を参照。

**サマリ:**
- S-1〜S-3, S-7〜S-8（コールバックルート・middleware のリフレッシュ/失敗パス）: Frontend Unit / Integration のみ。実 Google OAuth の自動化は非現実的なため E2E 対象外（既存 `global-setup.ts` の password grant 前例と同じ判断）
- S-4〜S-6（middleware 由来のリダイレクト・no-group リダイレクト・cookie 永続化）: E2E Mock
- 人間のレビューが必要な重要な発見: `frontend/e2e/global-setup.ts` の書き換えは既存 E2E スイート全体（`.auth/user.json` の storageState 形式）の認証前提を変えるため、`delete-e2e-groups` の前例より影響範囲が大きい。また `@supabase/ssr` がセッション cookie を複数チャンクに分割保存する可能性があり、fixture 構築の難度が上がる懸念がある（詳細は e2e-design.md 末尾、design.md Risks 参照）
