---
paths:
  - "frontend/**"
  - "backend/**"
---
# Testing Strategy

フロントエンド・バックエンドにまたがる全テストスコープの定義と、スコープ選択の判断基準を集約する。実装前のテスト設計（proposal.md の「ユーザーシナリオとテスト設計」セクション）にも参照する。

## テストスコープ定義

| スコープ | ツール | 対象・観点 |
|---------|--------|-----------|
| **Frontend Unit** | Vitest + React Testing Library | 単一コンポーネントの描画・props・状態管理・カスタムhooks・バリデーションロジック |
| **Frontend Integration** | Vitest + React Testing Library | 複数コンポーネントの連携・ページレベルの操作フロー（API は MSW/fetch mock）|
| **E2E Mock** | Playwright (`mock` project, localhost:3000) | ブラウザ操作フロー。外部API は route handler で stub |
| **E2E Preview** | Playwright (`preview` project, Vercel Preview URL) | ブラウザ操作フロー。外部API（Google CSE・Supabase Realtime）を実際に呼ぶ |
| **Backend Unit** | go test | ハンドラ・サービス・バリデーション（DB は mock/stub）|
| **Backend Integration** | go test + testcontainers | DB 操作・SQL クエリ・トランザクション（実 Postgres コンテナ使用）|

## スコープ選択基準（判断ツリー）

```
シナリオが決まったら以下の順に問う:

Q1: ブラウザを起動しないと検証できない？
  ├─ No  → Q3へ（Unit / Integration で検討）
  └─ Yes → Q2へ（E2Eが必要）

Q2: 外部API（Google CSE / Supabase Realtime）が必要？
  ├─ No  → E2E Mock
  └─ Yes → E2E Preview

Q3: 複数コンポーネントをまたぐ連携を検証する？
  ├─ No  → Frontend Unit / Backend Unit
  └─ Yes → Frontend Integration / Backend Integration
```

### E2E を選ぶ代わりに小さいスコープで代替できる条件

- API レスポンス形式が固定（mock で再現できる）→ Frontend Integration で十分
- DOM の確認が props/state の検証で代替できる → Frontend Unit で十分
- HTTP のリクエスト/レスポンスを検証したい（UI不要）→ Backend Unit / Integration

### Mock / Preview の選択基準

| 外部API | 環境 |
|---------|------|
| なし（REST CRUD のみ） | Mock |
| Google Custom Search API（画像検索） | Preview |
| Supabase Realtime（WebSocket 購読） | Preview |
| Supabase Postgres（直接クエリ以外） | Mock |

## テスト設計フォーマット（proposal.md で使用）

proposal.md の「ユーザーシナリオとテスト設計」セクションにはハイブリッド形式を使う。

### テンプレート

```markdown
## ユーザーシナリオとテスト設計

### フロントエンドシナリオ

#### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | <シナリオ名（日本語）> | Mock / Preview / - | E2E / Integration / Unit |

#### S-1: <シナリオ名>
**Given:** <前提状態>
**When:**  <ユーザー操作>
**Then:**  <期待結果>

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock / Preview | <何を確認するか> | <制約・前提> |
| Frontend Unit | <何を確認するか> | — |

**E2E判定:** Yes / No
**理由:** <なぜ E2E が必要 or 不要か>

---

### バックエンドシナリオ

#### サマリ
| # | シナリオ | スコープ |
|---|---------|---------|
| B-1 | <APIレベルのシナリオ名> | Backend Unit / Integration |

#### B-1: <シナリオ名>
**Given:** <前提状態（DBの状態など）>
**When:**  <API 呼び出し（例: POST /stock-items body={...}）>
**Then:**  <期待レスポンス / DB状態>

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Integration | <何を確認するか> | — |
```

### 記載上の注意

- シナリオが 6 件以上になる場合は `e2e-design.md` に切り出し、proposal.md からリンクする
- バックエンドシナリオはユーザー操作シナリオと分けてセクションを立てる（粒度が異なるため）

## 判断基準の更新ログ

レビューでスコープ変更が承認された際は以下の形式で追記する。

```
### YYYY-MM-DD: <変更の概要>
- **対象シナリオ:** <シナリオ名>
- **変更前:** <旧スコープ>
- **変更後:** <新スコープ>
- **理由:** <判断の根拠>
- **一般化した基準:** <次回以降に適用する基準>
```

<!-- ログはここから下に追記する -->

### 2026-05-26: モーダルexit animationとE2Eテストの干渉

- **対象シナリオ:** filter.spec.ts F-4/F-5、stock-items.spec.ts D-1/D-2、url-registration.spec.ts フルフロー
- **変更前:** `createItem()` ヘルパーが article 表示確認後すぐ次の操作へ移る
- **変更後:** `await expect(page.getByRole("dialog")).not.toBeAttached()` を追加して exit animation 完了を待つ
- **理由:** `AnimatePresence` の exit animation（200-300ms）中は dialog の DOM 要素が残存し、Playwright strict mode のロケータが複数要素を解決してエラーになる
- **一般化した基準:**
  1. モーダルを閉じた直後に `page.getBy系` でページ要素を操作する E2E テストは `await expect(page.getByRole("dialog")).not.toBeAttached()` を挟む
  2. 2つのモーダルが一時的に共存するシナリオ（例: URL登録モーダル→作成モーダルの遷移）では `getByRole("dialog")` ではなく内部要素（`getByLabel("名前")` 等）で待機する
  3. `AnimatePresence` を追加・変更したコンポーネントがある場合、関連 E2E テストのモーダル close 後の操作に上記 wait が必要かを確認する
- **tasks.md チェックリスト追加基準:** モーダルやアニメーションを含む変更の tasks.md には以下のタスクを加える
  - `- [ ] 既存E2Eテストのモーダル操作後のlocatorに not.toBeAttached() 待機が必要かを確認する`
  - `- [ ] ローカルで E2E テストを実行してpassすることを確認する（dev server 起動後に npx playwright test）`

### 2026-06-17: SW ランタイム戦略変更は既存 sw project E2E を更新する（新規 spec を足さない）

- **対象シナリオ:** service-worker.spec.ts S-8（shell HTML のキャッシュ戦略）
- **変更前:** S-8 は StaleWhileRevalidate 挙動（合成 v1 HTML を植え、再訪で植えた v1 が即描画される）をアサート
- **変更後:** NetworkFirst 挙動（オンライン再訪で植えた stale ではなくネットワークの実 HTML が描画され、キャッシュも実 HTML で上書きされる）をアサートするよう**既存テストを更新**。新規 spec ファイルは追加しない
- **理由:** SW のランタイムキャッシュ戦略はブラウザ実 SW を介さないと検証できず（判断ツリー Q1=Yes / 外部API不要なので Mock=`sw` project, `serviceWorkers: "allow"`）、かつ既存 S-8 を放置すると旧 SWR 挙動を緑のままアサートし続けてしまう。戦略を変える PR では該当 E2E の**更新が必須**
- **一般化した基準:**
  1. `sw.ts` のランタイムキャッシュ戦略（document/static/api の handler）や `next.config.ts` の pre-cache 内容を変更したら、`service-worker.spec.ts` の該当シナリオを**新仕様に書き換える**（net-new spec は足さない）
  2. SW E2E は `npm run test:e2e:sw`（`sw` project, 本番ビルド, port 3001）で opt-in 実行し pass を確認する。`mock`/`preview` project は SW を block するため SW 挙動の検証には使えない
  3. E2E アサートは「新戦略でしか通らない」discriminator になっているか（旧戦略では落ちるか）を確認する
  4. ChunkLoadError 自己回復のような副作用ロジックは実ブラウザ再現が高コスト/flaky なため、mock したグローバル（`caches`/`serviceWorker`/`sessionStorage`/`location.reload`）への unit で担保し E2E を増やさない

### 2026-06-18: AnimatePresence 由来の E2E flaky はテスト環境で reducedMotion により無効化する（アサート whack-a-mole より優先）

- **対象シナリオ:** filter.spec.ts F-3（買いたいものだけフィルター）ほか filter/modal の AnimatePresence 干渉クラス全般
- **変更前:** flaky が出るたびに該当アサートへ `not.toBeAttached()` 待機を個別追加（whack-a-mole）
- **変更後:** アプリを `<MotionConfig reducedMotion="user">` で包み、Playwright の `mock`/`preview` project に `contextOptions: { reducedMotion: "reduce" }` を設定して、テスト環境で framer-motion の transform/layout アニメをまとめて無効化する
- **理由:** flaky の真因は exit fade のレースではなく、`layout`/`popLayout` の **transform/layout churn でカード位置が動き locator/click が moving target になる**こと（`toBeVisible` は opacity を見ず、解消は AnimatePresence の unmount で起きる）。reducedMotion="user" は本番では prefers-reduced-motion を尊重する a11y 改善になり、テスト専用フラグを増やさない
- **一般化した基準:**
  1. framer-motion の `layout`/`AnimatePresence`/transform アニメ起因の E2E flaky は、まず**テスト環境での reducedMotion 無効化**で対処する（個別アサート待機の追加は補助）
  2. `reducedMotion` は @playwright/test では top-level `use` ではなく **`contextOptions: { reducedMotion: "reduce" }`** に置く。`sw` project には付けない
  3. reducedMotion は transform/layout を無効化するが **opacity exit は残る**ため、unmount を待つ既存の `not.toBeAttached()` 待機は引き続き load-bearing。除去しない
  4. flaky fix は「1回 green」では不十分。ローカル `--repeat-each` が不可なら CI の該当ジョブを複数回再実行して連続 green を確認する

### 2026-09-01: 非同期イベントの競合（race）を扱うロジックは、両方の到着順序を個別にテストする

- **対象シナリオ:** `useStockItems.test.ts`（parallelize-auth-init, Issue #236）の推測フェッチ失敗時の再試行ロジック
- **変更前:** 「フェッチ失敗 → 確定が後から届く」という1方向の順序のみをテストし、review clean と判断していた
- **変更後:** 「確定が先に届く → フェッチ失敗が後から処理される」という逆順序のテストも追加。両方が揃って初めて「先行フェッチ失敗時に確定groupIdと一致すれば一度だけ再試行する」ロジックが正しいと言える
- **理由:** 2つの非同期イベント（推測フェッチの reject と groups 確定の resolve）の到着順序は保証されない。片方の順序だけを discriminator にしたテストは、そのテスト自体は正しく red/green するにもかかわらず、逆順序では同じ silent-empty-state バグを再現してしまう実装を green のまま通してしまった（task review では検出されず、最終ブランチ全体レビューで発覚）
- **一般化した基準:**
  1. 2つ以上の非同期イベント（Promise の resolve/reject、React state 更新）の相対タイミングに依存するロジック（cancel フラグ、dedup、リトライ判定など）を追加・変更したら、**あり得る到着順序をすべて列挙し、それぞれに対応するテストケースを書く**。「代表的な1パターンで通った」は不十分
  2. 到着順序を制御するテストは `deferred()` 相当のヘルパー（resolve/reject を外部から任意タイミングで発火できる Promise）で書く。`waitFor` だけに頼ると、たまたま実装がフラッシュされるタイミングに救われて偽陽性の green になりうる
  3. task レビュー（変更差分のみを見る）はこの種のクロスタイミングの見落としを検出しにくい。race/timing ロジックを含む変更は、task レビューで Approved でも最終ブランチ全体レビューで再度トレースする価値がある

### 2026-09-04: E2E の同期待ちは「実際のシグナル」を待つ。副産物として機能していた proxy は前提が変わると壊れる

- **対象シナリオ:** realtime-sync.spec.ts（Supabase Realtime 購読の E2E、Issue #238 / PR #245）
- **変更前:** Realtime 購読完了の待機に `page.waitForLoadState("networkidle")` を使用（購読完了そのものを待っているわけではなく、購読が HTTP トラフィックの沈静化と同じタイミングで起きることを期待した代理シグナル）
- **変更後:** `window.__supabaseRealtimeSubscribed` フラグ（channel の `.subscribe()` コールバックが `SUBSCRIBED` を報告した時点で立てる、E2E 専用・本番挙動には関与しない）を `page.waitForFunction` で直接待つ
- **理由:** `networkidle` は HTTP リクエストの活動量だけを見る。Realtime の `phx_join` ハンドシェイクは既に開いている WebSocket 上を流れるため、`networkidle` は本来これを観測できない。それでも動いていたのは、購読処理がマウント時に同期的に呼ばれていたため、HTTP がまだ沈静化していないタイミングに偶然乗っていただけ。Supabase SDK を動的 import 化した変更（本 PR の主目的）で `.subscribe()` 呼び出しが非同期フックの後ろに移動し、この偶然の一致が崩れて初めて顕在化した（CI で同一アサートが複数回連続失敗するまで誰も気づかなかった）
- **一般化した基準:**
  1. 「本来観測したいイベントを直接見ていない wait」は、たとえ現状動いていても **副作用に依存した proxy** であることを疑う。特に `networkidle` / 固定 `sleep` / 無関係な要素の出現待ちなどで非同期処理の完了を代用している箇所は、その処理のタイミングを変える変更（同期→非同期化、fetch のバンドル分割・遅延読み込みなど）が入るたびに再検証する
  2. E2E からしか観測できない非同期完了（WebSocket 購読確立など）は、本番コードに最小限のテスト専用シグナル（グローバルフラグ等）を用意し、`waitForFunction` 等で直接待つ。本番挙動を変えない（データ取得や副作用を伴わない）ことをレビューで確認する

### 2026-09-04: `.serial` スイートの後片付けが最後のテストにしかない場合、retry がその後片付けごと汚染される

- **対象シナリオ:** realtime-sync.spec.ts の `test.describe.serial`（INSERT → wantToBuy トグル → DELETE の3テスト、DELETE が最後に作成物を片付ける設計）
- **変更前:** 後片付け（DELETE）は3番目のテストの中でのみ行われていた。`.serial` は途中のテストが失敗すると残りをスキップするため、2番目のテストが失敗すると DELETE は実行されず、1番目のテストが実際に作成した行が DB に残る
- **変更後:** `test.beforeAll`（`.serial` グループの retry 単位＝「1回の試行」ごとに再実行される。`test.beforeEach` は個々のテストの間でも発火するため、直前のテストが作った物を消してしまい別の問題を起こす）で、その回の試行を始める前に同名の残留データを必ず削除する
- **理由:** `.serial` は失敗すると **グループ全体を先頭からやり直す**。後片付けが最後のテストの中だけにあると、直前の失敗の残留データが retry に持ち越され、2回目以降のテストが「本来検証したい非同期の伝播」を経由せず、ただの REST 初期フェッチだけで assertion を満たしてしまう（偽陽性の pass）。今回は Realtime 配信の疑わしい遅延を調査する過程で、retry が不自然に速く（1〜2秒で）pass するログから発覚した
- **一般化した基準:**
  1. `.serial` スイートで作成した行・状態を最後のテストでのみ片付ける設計は、**途中のテストが落ちると後片付けごと skip される**ことを前提に見直す。retry 前提の CI（`playwright.config.ts` の `retries`）を使うなら、グループ単位の `beforeAll` で「その試行を必ずクリーンな状態から始める」保証を持たせる
  2. 挙動が怪しく速い pass（本来ネットワーク往復や非同期処理を要するはずのアサートが数百ms〜1秒台で通る）は、その pass が本当に検証したい経路を通っているか疑うシグナル。実測時間を pass/fail の判定だけでなく **タイミングの妥当性**込みで読む
  3. 外部インフラ（Supabase Realtime 等）由来の断続的な遅延・欠落が原因と判明し、かつ根本原因の追跡がコストに見合わないとユーザーが判断した場合は、（a）retry を汚染しないようテストの後片付けを堅牢化した上で、（b）該当 describe ブロックの `retries` を `test.describe.configure({ retries: N })` で個別に引き上げて許容する。プロジェクト全体の `playwright.config.ts` の retries は変更しない
  4. **追記（同日、訂正あり）**: 一時、E2E テストユーザーの `group_members` 蓄積（263件、`global-setup.ts` が CI 実行毎に新規 group を作成する一方 `DELETE /api/groups/:id` 未実装で片付けられていなかった）を根本原因と誤認した（263→1 に削除した直後にたまたま green になったことに引きずられた n=1 の相関）。直後に group_members=4 の状態でも同じ 4/4 失敗が再現し、さらに同一 Vercel Preview deployment・同一コードの rerun で fail→pass が再現したため、コード・行数・deployment のいずれにも相関しない**純粋な間欠的インフラ不安定性**と判明（根本原因は未特定のまま、詳細は Issue #247）。retry 許容（上記1-3）は変更なしで妥当。教訓: **1回の「対策後に green になった」だけで因果を確定しない**。同一条件での再現・反証（今回で言えば行数を変えて再度落ちるか、同一 deployment を rerun して安定するか）を試すまでは "相関" と "確定した原因" を区別して報告する。`group_members` の無制限蓄積自体は別の実際の問題として残り（衛生上クリーンアップ済み）、`DELETE /api/groups/:id` の実装は引き続き追跡する

### 2026-09-04: 同じ不変条件が複数の独立した経路で冗長に保証されている場合、1箇所だけを崩す discriminator では検出できない

- **対象シナリオ:** startupFetch.integration.test.tsx（Issue #236 の並行フェッチ保証、`useStockItemsRealtime` の Supabase クライアント非同期化に伴う健全性確認、PR #245 Task 6）
- **変更前:** discriminator（意図的に実装を直列化して該当テストが red になることを確認する手法）を1回試して red にならなかった時点で「テストは discriminator として機能していない」と誤判定しそうになった
- **変更後:** `AuthContext.tsx` の `getSession` 効果と `onAuthStateChange` 効果、それぞれを個別に直列化する2回の試行では red にならず、両方を1つの pending Promise で同時に直列化する3回目でようやく red になった。つまり Issue #236 の保証（groups 確定を待たずに items フェッチを開始する）は、2つの独立したコードパス（`onAuthStateChange` 効果自体と `loadGroups` の dedup ガード）によって **冗長に** 満たされていた
- **理由:** discriminator が一度で red にならないことは、必ずしも「テストが無意味」を意味しない。むしろ「保証がどこで作られているか」を1回の試行だけで決めつけず、疑わしい経路を1つずつ、最終的には組み合わせで潰していく必要がある。今回は3パターン目でようやく本当の直列化ポイントが判明した
- **一般化した基準:**
  1. discriminator が red にならない場合、直ちに「テストが弱い」と結論せず、**保証を作っている可能性のある経路を複数列挙**し、それぞれを（必要なら組み合わせて）直列化・無効化してから再判定する
  2. 冗長な二重保証が見つかった場合は bug ではなく発見（informational）として記録する。ただし「片方の経路だけが壊れても、もう片方が偶然カバーしてテストは green のまま」というリグレッション検出の穴が残ることは明示しておく（今回は非アクショナブルとして許容したが、該当コードを次に触るときの注意点として引き継ぐ）
