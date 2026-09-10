## 1. middleware: fail open の3分類化（Decision 1）

- [x] 1.1 `frontend/src/middleware.ts` の `data === null && error !== null` 分岐を、`isAuthRetryableFetchError(error)` / `isAuthRefreshDiscardedError(error)`（`@supabase/auth-js` からの型ガード import）による3分類に置き換える。いずれかを満たせば fail open（現行の observability ログは維持）、どちらも満たさなければ `isDefinitelyUnauthenticated = true` とする
- [x] 1.2 既存の `frontend/src/middleware.test.ts` の `AuthRetryableFetchError` を模したテストのモックを、`{ name: "AuthRetryableFetchError" }` のプレーンオブジェクトから実際の `AuthRetryableFetchError` インスタンス（型ガードのダックタイピング `__isAuthError` を満たす）に置き換える（S-1、design.md/proposal.md に明記済みの既知の落とし穴）
- [x] 1.3 S-2 を実装する: `AuthRefreshDiscardedError` インスタンスを返した場合に fail open で通過することを確認するテストを追加する
- [x] 1.4 S-3 を実装する: いずれの型ガードも満たさないエラー（例: `AuthInvalidJwtError`）を返した場合に `/login` へリダイレクトすることを確認するテストを追加する。本 change の真の discriminator——旧実装（Phase A）に対して red になることを確認する（`testing.md` 2026-06-17/2026-09-04/2026-09-10 の一般化基準に従う）
- [x] 1.5 S-3 の非保護ルート版を実装する: 同じエラーで非保護ルートへのリクエストの場合はリダイレクトしないことを確認する回帰テストを追加する

## 2. AuthGuard: 受動的セッション喪失時のフォールバックUI（Decision 2）

- [x] 2.1 `frontend/src/components/AuthGuard.tsx` に3値目の分岐（`authEnabled && !loading && !session` の場合）を追加し、children の代わりに「セッションが切れました」旨のメッセージと `/login` へのリンクを表示する。リダイレクト（`router.push`/`router.replace`）は呼ばない
- [x] 2.2 S-4 を実装する: `session: null, loading: false` のときフォールバックメッセージと `/login` リンクが表示され、かつ `mockPush`/`mockReplace` が呼ばれないことを確認するテストを追加する
- [x] 2.3 S-5 を実装する: 既存の `AuthGuard.test.tsx:69-77`（`loading: true` で children を表示しないテスト）を拡張し、フォールバックメッセージも表示されないことを確認する
- [x] 2.4 既存の `AuthGuard.test.tsx` の他のテストケース（no-group リダイレクト等）が新しい3値分岐と衝突していないか確認する（design.md の Risk 参照）

## 3. middleware: JWKS キャッシュ調査（Decision 3、撤回済み）

- [x] 3.1 調査完了・実装不要と判断。根拠: (a) 本番 Supabase プロジェクトの署名鍵は ES256（`curl {supabaseUrl}/auth/v1/.well-known/jwks.json` で確認済み、非対称鍵）のため `getClaims()` はローカル検証経路を通る。(b) `@supabase/auth-js`（`GoTrueClient.js`）はモジュールレベルの JWKS キャッシュ `GLOBAL_JWKS` を既に内蔵しており、Vercel/Lambda のようなプロセス/アイソレート再利用環境向けに明示的に設計されている（ソースコメントに Vercel Fluid Compute / AWS Lambda / Supabase Edge Functions を名指し）。TTL は10分で、鍵ローテーション（新しい `kid`）は TTL に関わらず即時再取得される（`fetchJwk` の kid-miss 経路）。independent な独自キャッシュを実装しても同じ特性を重複するだけで追加の利益がない。詳細は design.md Decision 3 参照

## 4. 最終確認

- [x] 4.1 `cd frontend && npx tsc --noEmit` が clean であることを確認する
- [x] 4.2 `cd frontend && npx biome check` が clean であることを確認する
- [x] 4.3 `cd frontend && npx vitest run` が green であることを確認する
- [x] 4.4 `cd frontend && npx playwright test --project=mock` で既存 E2E スイート全体（`auth.spec.ts` の S-4〜S-6 含む）が green であることを確認する（JWKS キャッシュ導入後も認証が壊れていないことの間接的な regression 確認、proposal.md 参照）
- [x] 4.5 CI（`ci.yml`, `e2e.yml`, `e2e-preview.yml`）が green になることを確認する
