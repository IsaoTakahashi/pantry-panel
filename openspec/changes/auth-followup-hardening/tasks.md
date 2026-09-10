## 1. middleware: fail open の3分類化（Decision 1）

- [ ] 1.1 `frontend/src/middleware.ts` の `data === null && error !== null` 分岐を、`isAuthRetryableFetchError(error)` / `isAuthRefreshDiscardedError(error)`（`@supabase/auth-js` からの型ガード import）による3分類に置き換える。いずれかを満たせば fail open（現行の observability ログは維持）、どちらも満たさなければ `isDefinitelyUnauthenticated = true` とする
- [ ] 1.2 既存の `frontend/src/middleware.test.ts` の `AuthRetryableFetchError` を模したテストのモックを、`{ name: "AuthRetryableFetchError" }` のプレーンオブジェクトから実際の `AuthRetryableFetchError` インスタンス（型ガードのダックタイピング `__isAuthError` を満たす）に置き換える（S-1、design.md/proposal.md に明記済みの既知の落とし穴）
- [ ] 1.3 S-2 を実装する: `AuthRefreshDiscardedError` インスタンスを返した場合に fail open で通過することを確認するテストを追加する
- [ ] 1.4 S-3 を実装する: いずれの型ガードも満たさないエラー（例: `AuthInvalidJwtError`）を返した場合に `/login` へリダイレクトすることを確認するテストを追加する。本 change の真の discriminator——旧実装（Phase A）に対して red になることを確認する（`testing.md` 2026-06-17/2026-09-04/2026-09-10 の一般化基準に従う）
- [ ] 1.5 S-3 の非保護ルート版を実装する: 同じエラーで非保護ルートへのリクエストの場合はリダイレクトしないことを確認する回帰テストを追加する

## 2. AuthGuard: 受動的セッション喪失時のフォールバックUI（Decision 2）

- [ ] 2.1 `frontend/src/components/AuthGuard.tsx` に3値目の分岐（`authEnabled && !loading && !session` の場合）を追加し、children の代わりに「セッションが切れました」旨のメッセージと `/login` へのリンクを表示する。リダイレクト（`router.push`/`router.replace`）は呼ばない
- [ ] 2.2 S-4 を実装する: `session: null, loading: false` のときフォールバックメッセージと `/login` リンクが表示され、かつ `mockPush`/`mockReplace` が呼ばれないことを確認するテストを追加する
- [ ] 2.3 S-5 を実装する: 既存の `AuthGuard.test.tsx:69-77`（`loading: true` で children を表示しないテスト）を拡張し、フォールバックメッセージも表示されないことを確認する
- [ ] 2.4 既存の `AuthGuard.test.tsx` の他のテストケース（no-group リダイレクト等）が新しい3値分岐と衝突していないか確認する（design.md の Risk 参照）

## 3. middleware: JWKS モジュールレベルキャッシュ（Decision 3）

- [ ] 3.1 `frontend/src/lib/jwksCache.ts` を新規作成する。`NEXT_PUBLIC_SUPABASE_URL` から導出した JWKS discovery endpoint（`{supabaseUrl}/auth/v1/.well-known/jwks.json`）を fetch し、モジュールレベル変数に `{ keys, fetchedAt }` としてキャッシュする関数を実装する。TTL は設計上10分を想定（実装時に調整可）。fetch 失敗時は例外を投げず `undefined` を返す
- [ ] 3.2 `JWK` 型が `@supabase/supabase-js`/`@supabase/ssr` から re-export されているか確認し、されていなければ `@supabase/auth-js` から直接 import するか必要な形のみローカル定義する（design.md の確認事項）
- [ ] 3.3 `jwksCache.test.ts` を新規作成し、キャッシュなし→fetch、TTL内2回→fetch1回、TTL経過後→再fetch、fetch失敗→undefined を返す、の4パターンを検証する
- [ ] 3.4 `frontend/src/middleware.ts` で `getClaims()` 呼び出し前に `jwksCache` からキャッシュを取得し、値があれば `getClaims(undefined, { jwks: { keys } })` の形で渡す。値が無ければオプション無しで呼ぶ
- [ ] 3.5 `middleware.test.ts` を拡張し、`getClaimsMock` の呼び出し引数を検証する: キャッシュが有効な `keys` を返すとき `jwks` オプション付きで、`undefined` を返すとき `jwks` オプション無しで `getClaims()` が呼ばれることを確認する
- [ ] 3.6 design.md の Trade-off（TTL 内に鍵がローテーションされ検証失敗した場合の懸念）について、`getClaims()` が渡した鍵セットで検証失敗した場合にライブラリ自身が最新鍵セットへフォールバック・リトライするかどうかを実装時に確認する。行わない場合、TTL 内であっても検証失敗時は `jwks` オプション無しで一度だけ再試行するセーフティネットの要否を判断し、必要ならタスクを追加してから実装する（実装に着手する前に controller へ判断結果を報告する）

## 4. 最終確認

- [ ] 4.1 `cd frontend && npx tsc --noEmit` が clean であることを確認する
- [ ] 4.2 `cd frontend && npx biome check` が clean であることを確認する
- [ ] 4.3 `cd frontend && npx vitest run` が green であることを確認する
- [ ] 4.4 `cd frontend && npx playwright test --project=mock` で既存 E2E スイート全体（`auth.spec.ts` の S-4〜S-6 含む）が green であることを確認する（JWKS キャッシュ導入後も認証が壊れていないことの間接的な regression 確認、proposal.md 参照）
- [ ] 4.5 CI（`ci.yml`, `e2e.yml`, `e2e-preview.yml`）が green になることを確認する
