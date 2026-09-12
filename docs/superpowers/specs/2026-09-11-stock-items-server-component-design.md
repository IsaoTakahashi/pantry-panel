# stock-items Server Component化 設計書

## Context

epic #179（初回起動パフォーマンス改善）の最後の残タスク、Issue #182。

#182 の本文は「認証を @supabase/ssr の cookie ベースに移行し、stock-items を Server Component化する」という2本柱で書かれていたが、前者（cookie ベース認証への移行）は Phase A（PR #257, #259）で既に完了済み。issue 本文の「現状」セクション（認証は localStorage ベース、という記述）はこの完了を反映しておらず古い。

残っているのは「stock-items ページを Server Component化し、SSR HTML に初期商品データを埋め込むことで `skeleton → 商品表示` の遅延をほぼゼロにする」という部分のみ、と当初想定していたが、ブレインストーミング中の調査で以下が判明し、スコープが当初の想定より大きいことが分かった:

1. アクティブグループID（複数グループ所属時にどれを表示するか）は現在 `localStorage`（キー `pantry-panel:active-group-id`）にしかなく、サーバー側から読めない
2. `AuthGuard.tsx` のレンダーゲート（`session && (group || speculativeGroupId)`）は、`AuthContext` の初期状態が常に `session=null, loading=true` から始まるため、SSRで items を props 渡ししても **`AuthGuard` 自体が初回レンダー（SSR HTMLを含む）で `null` を返し、子要素を一切描画しない**。つまり Server Component化だけでは体感速度は改善しない
3. `speculativeGroupId`（Issue #236/PR #239）は「groups確定前に先行フェッチする」という役割に加え、実は「`AuthGuard`のゲート条件の後半を満たし描画ブロックを解除する」という別の役割も担っていた

このため、本設計は当初想定の「stock-items 1ページの変更」ではなく、**認証ブートストラップ連鎖全体**（middleware → layout → AuthContext → AuthGuard → useStockItems → page.tsx）にまたがる。

## Goals / Non-Goals

**Goals:**
- stock-items ページ訪問時、cookie に有効なアクティブグループIDがあれば、JS実行・hydration を待たずに初期HTMLへ商品一覧を埋め込む
- 既存の認証・グループ選択・Realtime同期・書き込み系ハンドラの挙動（レースガード含む）を壊さない
- cookie 未設定（初回訪問・移行期間）でも従来通り動作する（劣化はするが壊れない）

**Non-Goals:**
- グループ一覧（`/api/groups/me` の結果、`GroupSwitcher` 用）のSSR化。今回は items のみ
- `localStorage` の `pantry-panel:active-group-id` の削除（cookieと二重に書き続ける。将来的な削除は別スコープ）
- `middleware.ts` → `proxy.ts` へのrename（このNext.jsバージョンで非推奨と判明したが、#182とは無関係な既存の事実。別途フォローアップ候補として記録するのみ）
- Issue #261（AuthGuardのサインアウトフラッシュ）との統合。ゲート条件は変更するが、#261で導入した中立文言のフォールバックUIパスはそのまま維持する

## Decisions

### D1. アクティブグループIDの cookie 並行保存

- Cookie名: `pantry-panel-active-group`。`path=/`, `SameSite=Lax`, 有効期限は長め（1年）、`httpOnly` にはしない（クライアントJSが書き込むため）
- グループIDそのものは秘密情報ではない。認可は引き続きAPI側がアクセストークン+groupIdの組み合わせで検証する（既存の `effectiveGroupId` がクライアント→APIに渡る経路と同じで、cookie改竄によるリスクは既存と同等）
- `AuthContext.tsx` の `switchGroup()` と `applyGroups()`（デフォルトグループ確定時）が、既存の `localStorage.setItem(ACTIVE_GROUP_KEY, ...)` と同じタイミングで `document.cookie` にも書く
- `localStorage` は当面残す（読み取りの正はcookieに一本化するが、削除はしない。将来のクリーンアップは別スコープ）
- **Migration**: cookie未設定ユーザーの初回訪問時、`AuthContext` マウント時に `localStorage` の既存値を読んで一度だけ cookie に書く

### D2. `stock-items/page.tsx` の Server Component化

`async function StockItemsPage()` にし、以下を行う:

1. `next/headers` の `cookies()` から Supabase セッション cookie を読み、`createSupabaseServerClient`（`middleware.ts` と共有する既存関数）でサーバー用クライアントを作る
2. `getSession()` でアクセストークン（`session.access_token`）を取得する（`getClaims()` は decode 済み claims のみを返し raw token を含まないため、Go API へのAuthorizationヘッダーには使えない。middlewareの検証は既に通過済みという前提のもと、ここでは軽量な `getSession()` を使う）。セッションが取れなければ以降をスキップし `initialItems: null` を渡す（エラー画面は出さない。後述 D6）
3. `pantry-panel-active-group` cookie を読む。**未設定なら items は SSR しない**（`initialItems: null`）。サーバー側で「デフォルトグループを推測する」ロジックは実装しない——groups をSSRしない方針（Non-Goal）と矛盾するため、cookie未設定時は素直にクライアントフェッチに委ねる
4. cookie に groupId があれば、それを使い Go API `/api/stock-items` 相当のサーバー用フェッチを実行
5. 成功すれば `StockItem[]`、失敗 or cookie未設定なら `null` を `initialItems` として `StockItemsClient` に渡す（空配列と未取得を型で区別する。D4参照）

### D3. 認証ブートストラップ連鎖

SSRされたitemsが実際に初回描画されるためには、`AuthGuard` のゲートが初回レンダーをブロックしないことが必須。以下の連鎖で解決する。

**`middleware.ts`**: 既存の `getClaims()` 判定で認証済みと分かった場合（`isDefinitelyUnauthenticated === false` かつ `data !== null`）、`request.headers` に `x-pp-authenticated: 1` をセットしてから `NextResponse.next({ request })` する。`EXCLUDED_PATHS`（`/login`, `/join`, `/auth/callback`）は現状通り `getClaims()` 自体を呼ばないため、このヘッダーは付かない（未認証扱いのデフォルトのまま。`node_modules/next/dist/docs/` の CSP nonce の例で、このヘッダー転送パターンは現行Next.jsでも有効と確認済み）。

**`layout.tsx`（ルート）**: `async function RootLayout` にし、`headers()` で `x-pp-authenticated` と cookie `pantry-panel-active-group` を読み、`<AuthProvider initialAuthenticated={boolean} initialGroupId={string | undefined}>` として渡す。

**`AuthContext.tsx`**: `useState` の初期値を `initialAuthenticated`/`initialGroupId` から組み立てる。`session` の中身（`access_token` 等）は初期 `undefined` のまま（`getSession()` 解決後に埋まる）。`speculativeGroupId` は `initialGroupId`（cookie由来）に改名・差し替え——**削除ではない**。役割（`AuthGuard`ゲートの後半を満たし描画ブロックを解除する）は存続し、発生源だけ `localStorage` の同期読み取りから、サーバーから渡された値に変わる。**`loading` の初期値は変更しない**（常に `true` から始まる、従来通り）。理由はD5参照。

**`AuthGuard.tsx`**: children を返すゲート条件を `(session || initialAuthenticated) && (group || initialGroupId)` に変更。`initialAuthenticated` は「サーバーが認証済みと確認した」という一度きりの事実であり、`getSession()` が後から `session=null` を返す場合（トークン失効等）は既存の受動的セッション喪失フォールバック（Issue #261の中立文言パス）に自然に合流する。**`/no-group` へのリダイレクトを行う `useEffect`（`if (!authEnabled || loading) return; if (session && !group) router.push("/no-group")`）は変更しない**（D5参照）。

### D4. `useStockItems` の変更

- シグネチャに `initialItems: StockItem[] | null` を追加
- `items` の初期state を `initialItems ?? []` にする
- `initialItems !== null` の場合、初回マウント時点で `loading=false` にし、同じ `effectiveGroupId` に対する初回fetch effectをスキップする（`initialItems` をその groupId に対する最新値として信頼する）
- `effectiveGroupId` が変化した場合（`switchGroup` 等）は通常通りfetchする。`speculativeFailureRef`・リトライ機構は不変
- `useStockItems.ts:59-66` のコメント（「未確定IDでは書き込みハンドラが呼ばれ得ない」という前提の説明）は、`initialGroupId`（cookie由来、未確定カテゴリ）に文言更新する。前提自体は崩れない——`group` 未確定中は `effectiveGroupId` が `initialGroupId` になるだけで、「未確定」という分類は変わらないため

### D5. `loading` の意味は変更しない（実装計画作成中に発見した訂正）

D3の初稿では「`loading` の初期値を `initialAuthenticated` が true なら `false` 相当にする」としていたが、これは誤りだったため訂正する。

**発見した問題**: 現行コードでは `loading === false` は「groups の解決（確定 or 確定的な不在）が完了した」ことを意味する不変条件であり、`AuthContext.tsx` の `onAuthStateChange` ハンドラのコメント（133-135行目）が明示的にこれを警告している（「ここで無条件に `setLoading(false)` すると `group=null` のまま `loading` が倒れ、`AuthGuard` が起動時の group 取得待ち中に誤って `/no-group` へ飛ばす」）。`AuthGuard.tsx` の `/no-group` リダイレクト用 `useEffect` はこの不変条件に依存している（`loading` が false になって初めて `session && !group` を評価する）。D3案のように `initialAuthenticated=true` の場合に `loading` の初期値を `false` にしてしまうと、この不変条件が壊れ、**groupsがまだ確定していないのに `session` 解決後 `group` がまだ `null` である一瞬に `/no-group` へ誤ってリダイレクトしてしまう**（セッション確定〜groups確定の間の競合状態）。

**訂正した方針**:
- `loading` の意味・初期値（常に `true` から開始）・`/no-group` リダイレクト用 `useEffect` の条件は**一切変更しない**
- 初回ペイントのブロック解除は `AuthGuard` の children ゲート（`(session || initialAuthenticated) && (group || initialGroupId)`）**のみ**で行う。新しいcontextフィールド（例: `groupsConfirmed`）は不要——既存の `loading` がそのまま「groups確定済みか」を表し続けるため
- `StockItemsClient.tsx:112` の `if (authLoading) return <StockItemsSkeleton />;` も同様に `loading` に頼ったままだと、SSRでitemsを埋め込んだケースでもここでブロックされてしまう（これも実装計画作成中に見つかった、D3では触れていなかった見落とし）。修正: `if (authLoading && initialItems === null) return <StockItemsSkeleton />;` とし、`initialItems`（D4で導入）が非nullの場合のみスケルトンをスキップする。`initialItems === null`（cookie未設定・SSR失敗）の場合は従来通りスケルトンを表示する

**この訂正で4状態を確認**:
| 状態 | AuthGuardの children ゲート | `/no-group`リダイレクト | StockItemsClientのスケルトン |
|---|---|---|---|
| 認証済み+cookie(groupId)あり | 即座に true（`initialAuthenticated && initialGroupId`） | `loading` 解決まで発火しない（不変条件通り） | `initialItems` があればスキップ |
| 認証済み+cookieなし | `session` 解決まで `null`（従来通り） | 同上 | 従来通り表示 |
| 未認証 | フォールバックUI（`!loading && !session`、従来通り） | 発火しない（`session` が truthy にならない） | N/A（AuthGuardより手前でmiddlewareが/loginへ） |
| auth無効（env未設定） | `!authEnabled` で即children | 発火しない（`!authEnabled` で早期return） | 従来通り |

**テストへの追加**: `AuthGuard` のユニットテストに、`session` truthy・`group === null`・`loading === true`・`initialGroupId` ありの状態で「`router.push` が呼ばれず、children が描画される」ことを確認するテストケースを追加する（この不変条件を将来のリファクタで再度壊さないためのピン留め）。

### D6. SSR取得失敗時のフォールバック

Server Component での `/api/stock-items` フェッチが失敗（タイムアウト・Lambda一時障害等）した場合、`initialItems: null` を渡し、エラー画面は出さない。クライアント側の `useStockItems` が通常のfetchフロー（loading表示 → フェッチ）にフォールバックする。SSRはbest-effortの高速化であり、失敗してもページ自体は壊れない。

## Testing Plan

**Frontend Unit/Integration:**
- `AuthContext`: `initialAuthenticated`/`initialGroupId` からの初期値組み立て
- `AuthGuard`: 新ゲート条件（`initialAuthenticated`/`initialGroupId` あり/なしの各パターン）
- `useStockItems`: `initialItems` ありでの初回fetchスキップ、`effectiveGroupId` 変化時の再fetch、リトライ機構が壊れていないこと
- `page.tsx`（Server Component）: cookie有無・`getClaims()`成功失敗・API成功失敗の分岐

**E2E（新規、重要）:**
- 「cookie設定済み・有効なgroupIdのとき、JS実行前の初期HTMLに商品名が含まれる」ことを検証するテストを追加する（`javaScriptEnabled: false` context か `waitUntil: "commit"` 直後のcontentチェック）。このテストが無いと、実装がクライアントフェッチにフォールバックし続けていても既存specが全部greenのまま気づけない（`testing.md` 2026-09-04 の networkidle proxy の教訓と同種の穴）

**既存E2Eへの影響（調査済み）:**
- 全specが最終状態への自動待機（`toBeVisible()`等）で書かれており、ローディング状態やタイミングをハードコードしたテストは無い
- `auth.spec.ts` S-5（`/api/groups/me` を空配列にstub）はgroups取得ロジック自体を変えないため無影響
- 影響を受ける既存specは基本的に無しという見立て。実装時に反証されたら本設計に追記する

**追記（Task 10, 全体検証時に反証）:** `health.spec.ts`（`getByText("ok")`、非exact match）が `npx playwright test --project=mock` のローカル実行で稀に strict mode violation で flaky になることを確認した（1回のフル実行で1件、retry で green）。原因は本designの本体（`RootLayout` を async化し `getServerAuthBootstrap()` で `cookies()`/`headers()` を無条件に読む変更、`frontend/src/app/layout.tsx`）そのもの。`RootLayout` は `/stock-items` だけでなく `/health` `/login` `/invite` を含む全ルートをラップしているため、この変更で**アプリの全ルートが prerendering 対象外の完全動的ルートになった**。Next.js dev server はこれを `Route "/health": Next.js encountered runtime data during prerendering.` という issue として検知し、Dev Tools のオーバーレイ（"N Issue" バッジ）に code frame（`cookieStore = ` / `cookies();` を含むソース断片）を描画する。このオーバーレイが稀に `/health` ページの DOM に同時に存在し、`getByText("ok")`（非exact）がオーバーレイのソース断片テキスト（"c**ok**ieStore" 等）にも一致してしまい strict mode violation になる。
  - 本体のテスト（`auth.spec.ts` S-4/S-4回帰/S-5/S-6、`ssr-stock-items.spec.ts`、`stock-items.spec.ts` 全4件）はこの影響を受けず green だった。影響は `health.spec.ts` 単体かつ非exact locator に限定される
  - **見落としていたリスク**: 本designは「`/stock-items` の SSR 化」に焦点を当てていたが、認証ブートストラップを `RootLayout` に置いたことで **`/stock-items` 以外の全ルートも副作用として prerendering 対象外になる**という trade-off が Risks/Trade-offs セクションに記載されていなかった。実運用上（Vercel 本番ビルド）の静的最適化への影響は本タスクでは未検証（dev server 上の warning のみ確認）。将来的にこの trade-off を許容するか、`headers()`/`cookies()` を `/stock-items` 配下のみで読むよう限定するかは別途判断が必要
  - **追記**: 当初は本タスク（Task 10: 検証・ドキュメントのみ）のスコープ外として `health.spec.ts` 自体の修正を見送る方針だったが、`.github/workflows/e2e.yml` を確認したところ CI の E2E ジョブも `PREVIEW_URL` を設定せず `npx playwright test --project=mock`（`npm run dev` の dev server 上で実行）を使っており、この flake は preview 限定ではなく **CI 上でも再現しうる**と判明した。そのため `getByText("ok", { exact: true })` / `getByText("connected", { exact: true })` へその場で修正した（`--repeat-each=5` で5/5 green、フルスイート再実行でも flaky 消失を確認）。この trade-off（`RootLayout` が全ルートを完全動的にする）自体は未解決のまま残っている

**Migration動作確認:**
- cookie未設定・localStorageに既存値ありのユーザーが初回訪問し、一度だけcookieが書かれることを確認する

## Risks / Trade-offs

- [Risk] `AuthGuard` のゲート緩和により、`session` が未確定な一瞬 `StockItemsClient` が `accessToken === undefined` でレンダーされる → Mitigation: SSRされた `initialItems` が初回描画をカバーし、この window では書き込み系UIに到達できない（D4のコメント更新で前提を再確認）
- [Risk] cookieの情報源が増える（cookie / localStorage 二重管理）→ Mitigation: 読み取りの正はcookieに一本化し、localStorageは移行期間の名残としてのみ書き続ける。将来的な削除は別スコープ
- [Risk] 1 PR にまとめる方針のため、変更が大きくレビューコストが高い → Trade-off: 認証ブートストラップ連鎖は互いに密接に依存しており、分割すると中間状態が完全には動かないブレークポイントになりやすいため、ユーザーとの合意で1 PRを選択（general.mdの300行目安は超過する見込み、PR説明で経緯を明記する）
- [Risk] middleware→Server Component間のヘッダー転送は Next.js のバージョン依存の挙動 → Mitigation: `node_modules/next/dist/docs/` のCSP nonce例で現行バージョンでの動作を確認済み。実装時に実機で再確認する
