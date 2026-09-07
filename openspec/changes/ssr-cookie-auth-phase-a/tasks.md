## 1. 依存関係・下準備

- [ ] 1.1 `frontend/package.json` に `@supabase/ssr` を追加する（Web検索で最新安定版を確認してから使用する、`general.md` のバージョン選定ルールに従う）。`@supabase/supabase-js` は型（`Session`/`User` 等）・`@supabase/ssr` の内部依存として引き続き必要かを確認し、不要になった場合のみ削除を検討する（安易な削除はしない）

## 2. サーバー側クライアント

- [ ] 2.1 `frontend/src/lib/supabaseServerClient.ts` を新規作成する。`createServerClient`（`@supabase/ssr`）をラップし、呼び出し側が cookie アクセサ（Next.js の `cookies()` または `NextRequest`/`NextResponse` の cookie API）を渡してリクエストごとに新規生成する関数として実装する（design.md Decision 2）。モジュールレベルキャッシュは行わない旨をコメントで明記する

## 3. middleware

- [ ] 3.1 `frontend/src/middleware.ts` を新規作成する。全リクエストでセッション cookie をリフレッシュする（`ssr-session-auth` spec の該当 Requirement）。リフレッシュ失敗時は fail open とし、リクエストをブロックしない（同 spec、e2e-design.md S-8 が discriminator）
- [ ] 3.2 同 middleware で、有効なセッション cookie が無い状態で保護対象ルート（`/stock-items`, `/invite`, `/no-group` 等。`/login`, `/join`, `/auth/callback`, 静的アセットは除外する）にアクセスされた場合、`/login` へリダイレクトする（同 spec、e2e-design.md S-4 が discriminator）
- [ ] 3.3 `matcher` 設定（`config.matcher` 等）で、静的アセット・API ルートなど middleware を適用すべきでないパスを適切に除外する

## 4. OAuth コールバックルート

- [ ] 4.1 `frontend/src/app/auth/callback/route.ts` を新規作成する。`GET` ハンドラで `code` クエリパラメータを受け取り、サーバー側クライアント（Task 2.1）で `exchangeCodeForSession(code)` を呼ぶ。成功時は `next` クエリパラメータ（未指定時は `/stock-items`）へリダイレクトし、セッション cookie を `Set-Cookie` する（design.md Decision 1、e2e-design.md S-1/S-2 が discriminator）
- [ ] 4.2 同ハンドラで、`exchangeCodeForSession` が失敗した場合はエラー情報付きで `/login` へリダイレクトする（e2e-design.md S-3 が discriminator）

## 5. ブラウザ側クライアント

- [ ] 5.1 `frontend/src/lib/supabaseClient.ts` の `createClient`（`@supabase/supabase-js`）を `createBrowserClient`（`@supabase/ssr`）に置き換える。モジュール評価時の動的 import・`_clientPromise` キャッシュ・`getSupabaseClient()`/`peekSupabaseClient()` の構造は維持する（design.md Decision 2、Issue #238/#245 のバンドルサイズ削減効果を保つため）。動的 import と `createBrowserClient` の組み合わせに困難がある場合は実装を止めて report で明示的にエスカレーションする（design.md Risk）

## 6. AuthContext / AuthGuard / サインインフロー

- [ ] 6.1 `frontend/src/contexts/AuthContext.tsx` のクライアント取得部分を Task 5.1 のブラウザクライアントに差し替える。`getSession()`/`onAuthStateChange` の購読構造、Issue #236 の並行フェッチ・cancel ガード・StrictMode 対応ロジックは変更しない（design.md Decision 4）
- [ ] 6.2 `AuthContext.tsx` の `signInWithGoogle` を修正し、`redirectTo` を `/auth/callback?next=<最終目的地>` の形に組み立てる。デフォルトの最終目的地は `/stock-items`
- [ ] 6.3 `frontend/src/components/AuthGuard.tsx` から「未ログイン → `/login`」のリダイレクトロジックを削除する。「group が無ければ `/no-group` へリダイレクトする」ロジックは変更しない（design.md Decision 3、`auth-guard` spec の MODIFIED 要件）
- [ ] 6.4 `frontend/src/components/AuthGuard.test.tsx` の「未認証のとき /login へリダイレクトする」テスト（124-131行目付近）を削除し、代わりに「`session: null` で render しても `mockPush` に `/login` が渡らないこと」を確認する逆方向のテストに置き換える（design.md Risks の Important 項目、e2e-design.md S-5 の Frontend Unit 部分）
- [ ] 6.5 `frontend/src/app/login/page.tsx` を修正し、「Googleでサインイン」クリック時に `next=/stock-items` が正しく渡ることを確認する。`exchangeCodeForSession` 失敗時のエラークエリパラメータを受け取ってエラーメッセージを表示するロジックを追加する（e2e-design.md S-3）
- [ ] 6.6 `frontend/src/app/join/page.tsx` の `signInWithGoogle(window.location.href)` 相当の呼び出しを、`next` に現在の `/join?token=xxx` を渡す形に修正する（e2e-design.md S-2）

## 7. Realtime フックの追従

- [ ] 7.1 `frontend/src/lib/useStockItemsRealtime.ts` のクライアント取得部分が Task 5.1 の変更後も正しく動作することを確認する（インポート元の変更のみで購読ロジック自体は無変更のはずだが、念のため既存テストで確認する）

## 8. ユニット・インテグレーションテスト（新規ロジック）

- [ ] 8.1 `app/auth/callback/route.ts` の `GET` ハンドラを直接呼び出すテストを追加する（`NextRequest` を組み立てて渡す）: `next` へのリダイレクト成功パス（`/stock-items` デフォルト・`/join?token=xxx` の場合、e2e-design.md S-1/S-2）、`exchangeCodeForSession` 失敗時のエラー付き `/login` リダイレクト（S-3）
- [ ] 8.2 `middleware.ts` のエクスポート関数を直接呼び出すテストを追加する: セッションリフレッシュ成功時に `Set-Cookie` が付与される（S-7）、リフレッシュ失敗時も `NextResponse.next()` 相当になる fail open（S-8）
- [ ] 8.3 `login/page.tsx` のエラークエリパラメータ受け取り時のエラーメッセージ表示テストを追加する

## 9. E2E: fixture 書き換え（高リスク、影響範囲大）

- [ ] 9.1 `frontend/e2e/global-setup.ts` の storageState 生成ロジックを、localStorage ベースのセッション注入から cookie ベースのセッション注入に書き換える。`@supabase/ssr` がセッション cookie を複数チャンクに分割保存する可能性がある点に注意し、実際に middleware が読める形（`path`/`sameSite`/`httpOnly`/`secure` 属性含む）で正確に再現する（design.md Risk、e2e-design.md 末尾）。実装が困難な場合は早期に controller へエスカレーションする
- [ ] 9.2 書き換え後、新規シナリオ（S-4〜S-6）だけでなく、**既存 E2E スイート全体**（`filter.spec.ts` / `stock-items.spec.ts` / `url-registration.spec.ts` / `image-selection.spec.ts` / `realtime-sync.spec.ts`）を `--project=mock` で実行し green であることを確認する。1回のみでなく `--repeat-each=2` 等で安定性も確認する
- [ ] 9.3 `frontend/e2e/global-teardown.ts` も cookie ベースのセッションに合わせて認証部分（`signInWithPassword` によるクリーンアップ用セッション取得）に影響が無いか確認する（teardown 自体は password grant で独自にセッションを取るため、変更不要な可能性が高いが確認する）

## 10. E2E: 新規シナリオ

- [ ] 10.1 e2e-design.md S-4（`javaScriptEnabled: false` での middleware リダイレクト確認）を実装する。本 change 適用前のコードに対して同じテストを実行すると red になることを一度確認する（`testing.md` 2026-06-17/2026-09-04 の一般化基準に従う）
- [ ] 10.2 e2e-design.md S-4 の JS 有効コンテキストでの回帰確認を実装する
- [ ] 10.3 e2e-design.md S-5（group 未所属時の `/no-group` リダイレクト、backend `/api/groups/me` を空配列で stub）を実装する
- [ ] 10.4 e2e-design.md S-6（cookie セッションのリロード・ナビゲーション間での永続化、localStorage にセッションキーが存在しないことの確認）を実装する

## 11. 最終確認

- [ ] 11.1 `cd frontend && npx tsc --noEmit` が clean であることを確認する
- [ ] 11.2 `cd frontend && npx biome check` が clean であることを確認する
- [ ] 11.3 `cd frontend && npx vitest run` が green であることを確認する
- [ ] 11.4 `cd frontend && npx playwright test --project=mock` で新規シナリオ・既存シナリオ全体が green であることを確認する（Task 9.2 の確認を最終状態で再確認する）
- [ ] 11.5 CI（`ci.yml`, `e2e.yml`, `e2e-preview.yml`）が green になることを確認する
- [ ] 11.6 手動でログイン・招待リンク経由の参加・グループ未所属時の `/no-group` 遷移・ログアウト・再ログインの一連の流れを実際に確認する（認証フロー全体の刷新のため、自動テストに加えて手動確認を必須とする）
