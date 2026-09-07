## Context

現行の `frontend/src/lib/supabaseClient.ts` は `@supabase/supabase-js` の `createClient` をモジュール評価時に動的 import し、`Promise<SupabaseClient | null>` をキャッシュして返す（Issue #238/#245）。セッションはこのクライアントが自動的に `localStorage` に保存・管理する。`AuthContext.tsx` はこのクライアントの `getSession()`/`onAuthStateChange` をマウント時に呼び、`AuthGuard.tsx` は `session`/`group`/`speculativeGroupId` の状態に応じて children のレンダー可否とリダイレクトを判断する（既存 spec: `openspec/specs/auth-guard/spec.md`）。

Server Component はブラウザの `localStorage` を参照できないため、この構造のままでは Issue #182 Phase B（stock-items の SSR 化）が実現できない。

本 change の設計は、事前のブレインストーミングで以下を確定させた:
- Issue #182 を Phase A（本 change）と Phase B に分割する
- Phase A に middleware でのルート保護を含める
- 既存セッションの移行は行わない（デプロイ後は全員再ログイン）
- Issue #238/#245 のバンドルサイズ削減（動的 import）は維持する

## Goals / Non-Goals

**Goals:**
- セッション管理を cookie ベース（`@supabase/ssr`）に移行する
- middleware で未ログイン時のサーバー側リダイレクトを実現する
- OAuth フローを標準の PKCE + コールバックルート方式に置き換える
- Issue #238/#245 のバンドルサイズ削減効果を維持する

**Non-Goals:**
- stock-items の Server Component 化・SSR データ埋め込み（Phase B）
- `AuthContext` の初期状態をサーバーから props で渡す設計、loading フラッシュの完全排除（Phase B で本題のデータ取得と合わせて検討する）
- 「group 未所属」判定の middleware 移管（backend 呼び出しが必要なため、全ナビゲーションに負荷をかけたくない。引き続き `AuthGuard` に残す）
- 既存セッション（localStorage）の cookie への移行・ブリッジ

## Decisions

### Decision 1: OAuth フローは標準の PKCE + コールバックルート方式を採用する

`signInWithOAuth` の `redirectTo` を `/auth/callback?next=<最終目的地>` に向け、新設する `app/auth/callback/route.ts`（Route Handler）が `code` クエリパラメータを受け取り、サーバー側クライアントで `exchangeCodeForSession(code)` を呼んでセッション cookie を書き込んだ後、`next` へリダイレクトする。

検討した代替案（クライアント側で完結させ、取得したトークンを別 API に POST して手動で cookie を書かせる方式）は、`@supabase/ssr` が想定する標準パターンではなく、middleware がリクエスト到達時点でセッションを検証できるという本 change の主目的を損なうため採用しない。

`join/page.tsx` は現状 `signInWithGoogle(window.location.href)` で招待トークン付き URL に直接戻す独自の `redirectTo` を持つ。コールバックルート方式では全 OAuth リダイレクトが `/auth/callback` を経由するため、最終目的地は `next` クエリパラメータとして引き回す（例: `/auth/callback?next=%2Fjoin%3Ftoken%3Dxxx`）。`login/page.tsx` は `next=/stock-items` がデフォルト。`invite/page.tsx` は独自のサインインフローを持たないため影響なし。

### Decision 2: ブラウザクライアントとサーバークライアントを別ファイルに分離する

`frontend/src/lib/supabaseClient.ts`（既存、ブラウザ用）は `createClient` を `createBrowserClient`（`@supabase/ssr`）に置き換えるのみで、モジュール評価時の動的 import + `_clientPromise` キャッシュ + `getSupabaseClient()`/`peekSupabaseClient()` という既存の構造はそのまま維持する（Issue #238/#245 のバンドルサイズ削減効果を保つため）。

`frontend/src/lib/supabaseServerClient.ts`（新規）はサーバー側（middleware・Route Handler）専用。`createServerClient`（`@supabase/ssr`）はリクエストの cookie に紐づくインスタンスを作る必要があるため、ブラウザ側のような「モジュールスコープでキャッシュする singleton」パターンは適用できない。**リクエストごとに新規生成する関数**として実装する（例: `createServerSupabaseClient(cookieStore)` のような、呼び出し側が cookie アクセサを渡す形）。

### Decision 3: `AuthGuard` の責務を分割する

「未ログイン → `/login`」の判定は middleware に移管し、`AuthGuard.tsx` から削除する（既存 spec `auth-guard` の該当 Requirement を削除する MODIFIED 変更）。

「ログイン済みだが group 未所属 → `/no-group`」の判定は `AuthGuard` に残す。理由: group 所属は `X-Active-Group-ID` ヘッダ付きで backend の `/api/groups/me` を呼ばないと判定できず、これを毎回 middleware（全ナビゲーションで実行される edge 相当のレイヤー）で行うと、認可不要なページ遷移にまで backend 呼び出しのレイテンシが乗ってしまう。この Requirement は変更しない。

### Decision 4: `AuthContext.tsx` の非同期構造は維持し、クライアント取得部分のみ差し替える

Non-Goals にある通り、「サーバーから初期セッションを props で渡す」設計は Phase A の範囲外とする。`AuthContext.tsx` は今まで通りマウント時に `getSupabaseClient()`（差し替え後は `createBrowserClient` ベース）を呼び、`getSession()`/`onAuthStateChange` を購読する構造を維持する。Issue #236 の並行フェッチ・cancel ガード・StrictMode 対応のロジックは変更しない。

## Risks / Trade-offs

- [Risk] 既存ユーザーは deploy 後に自動的にログアウト状態になる → ブレインストーミングで許容する判断済み。ワンクリックの Google ログインで復帰できるため実害は小さいと判断
- [Risk] `createServerClient` をリクエストごとに新規生成する設計は、`getSupabaseClient()` のようなモジュールレベルキャッシュができないため、ブラウザ側と実装パターンが非対称になる → cookie に紐づくインスタンスである以上避けられない制約。実装時にコメントで明記する
- [Trade-off] `middleware.ts` は「group 未所属」を判定しないため、group 未所属ユーザーは一度 `/stock-items`（または他の保護ルート）まで到達してから `AuthGuard` によってクライアント側で `/no-group` へリダイレクトされる。ページ本体の一瞬のちらつきが残る可能性があるが、Decision 3 の理由により許容する
- [Risk] `@supabase/ssr` の `createBrowserClient` を動的 import しつつ Issue #238/#245 のバンドルサイズ削減パターンを維持する実装は、`@supabase/ssr` 側のドキュメント化された典型的な使い方（モジュールトップレベルでの同期的な生成）とは異なる構成になる → 実装 Task で個別に検証し、difficulty が高い場合は controller にエスカレーションする
- [Risk]（テスト設計で発見）`frontend/e2e/global-setup.ts` の書き換えは、`playwright.config.ts` の `mock`/`preview` 両 project が共通で参照する `storageState: ".auth/user.json"` の中身の形式そのものを変える。`delete-e2e-groups` の `global-teardown.ts` 変更（加算的・独立）とは性質が異なり、書き換えが不完全だと既存 E2E スイート全体（filter/stock-items/url-registration/image-selection/realtime-sync）が「そもそもログイン状態にならない」形で一斉に失敗しうる → 実装 task で新規シナリオだけでなく既存スイート全体の green を確認する。詳細は e2e-design.md 末尾を参照
- [Risk]（テスト設計で発見）`@supabase/ssr` はセッション cookie を単一値ではなく複数チャンク（`sb-{project-ref}-auth-token.0`, `.1` ...）に分割して保存する場合があり、`global-setup.ts` で `storageState.cookies` を手で組み立てる実装難度が現行の単一 localStorage キーより上がる可能性がある → 実装が困難な場合は上記と同様に early escalation する
- [Important]（テスト設計で発見）既存 `AuthGuard.test.tsx` には「未認証のとき `/login` へリダイレクトする」テストが存在し、これは本 change の MODIFIED 要件（`AuthGuard` は未ログインリダイレクトを行わない MUST NOT）と直接矛盾する。単純削除ではなく、逆方向のアサーション（`session: null` で render しても `mockPush` に `/login` が渡らないこと）に置き換える。tasks.md に明示タスクとして含める

## Migration Plan

- DB スキーマ変更なし
- デプロイと同時に全ユーザーのセッションが無効化される（Risk 参照、許容済み）。ロールバック時も同様に全員再ログインが必要になる点に注意
- ロールバック: 通常の revert で良い（状態を持つ移行処理ではない）

## Open Questions

（なし。ブレインストーミングで主要な論点はすべて合意済み）
