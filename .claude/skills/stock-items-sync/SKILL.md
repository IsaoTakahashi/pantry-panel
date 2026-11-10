---
name: stock-items-sync
description: /stock-items の一覧（useStockItems の items）が、Realtime イベント・自分の変更・トークン更新のたびに行う再取得の結果、DB の最新状態に収束するかを TLA+ (TLC) で全順序検査する。useStockItems.ts / useStockItemsRealtime.ts の再取得・setItems・Realtime 購読、AuthContext の session 更新、または GET /api/stock-items を変更するとき、再取得の順序ガードを入れる・直すとき、「削除した商品が戻ってくる」「古い一覧のまま」系の不具合を調べるときに使う。
---

# stock-items-sync — 一覧の再取得が DB に収束するかの形式検証

## 何を検証しているか

- **約束:** Realtime 通知・自分の変更後の再取得・fetch がすべて落ち着いたとき、画面の一覧（React state `items`）は DB の最新状態と一致する。
- **破れたときの害:** 家族が追加・削除した商品が画面で消えたり戻ったりし、次の変更が起きるまでそのまま残る。
- **方法:** `model/StockItemsSync.tla` の小さなモデルを TLC で検査する。DB への書き込み、Realtime 通知の配達、トークン更新、fetch の発行、サーバーでの SELECT、応答の到着が、**どの順番で起きても**よいとして全状態を探索する。テストでは届く順番を 1 つずつしか試せないため、TLA+ を選んだ。

## 実行

リポジトリのルートから実行する。Java は `.mise.toml` で固定している。`tla2tools.jar` v1.7.4 は初回に `~/.cache/pantry-panel-tla/` へダウンロードされ、SHA-256 を照合する。

```bash
.claude/skills/stock-items-sync/scripts/check.sh
```

5 秒程度で終わる。出力の読み方:

| 行 | 意味 |
|----|------|
| `OK <config>: <結果> (expected <期待>)` | その設定の判定が期待どおり |
| `DIFF <config>: ...` | 期待と違う。ログのパスが出るので、反例（`State 1..n`）を読む。終了コード 1 |
| `STALE covered code changed since sync commit` | 下の「対象コード」が同期コミットから変わっている。判定はまだ古いコードのモデルについてのもの。終了コード 2（他に DIFF が無い場合） |

## 設定と期待される判定

`Guard` 定数で、`setItems` の前に応答をどう選別するかを切り替える。どの設定でも、main fetch effect の `cancelled`（新しい run が始まったら古い run の応答を捨てる）は今のコードどおり常に効いている。

| 設定 | `Guard` | コードとの対応 | 期待 |
|------|---------|---------------|------|
| `Current` | `"none"` | **同期コミット時点のコード**。Realtime 経由と変更後の再取得は、届いた応答をそのまま `setItems(data)` する | **fail（既知の検出結果）** |
| `Fixed` | `"shared"` | **すべての経路（Realtime・変更後・main fetch effect）で 1 つの通し番号を共有し**、すでに反映した応答より前に発行された fetch の応答を捨てる | pass |
| `RealtimeOnlyGuard` | `"realtimeOnly"` | `handleRealtimeChange` にだけ、自分専用の番号でガードを入れる | fail |
| `PerPathGuard` | `"perPath"` | 経路ごとに別々の番号（例: ハンドラごとの `useRef`）でガードする | fail |

`Current` の fail はチェックの故障ではなく、現行コードの不具合である。モデルや性質を弱めて pass にしないこと。

**修正するときの要件:** `Fixed` に対応するのは、番号を**すべての経路で共有する**実装だけ。経路ごとの番号では、別の経路の古い応答が新しい結果を上書きできる（`PerPathGuard` の反例）。

### 既知の検出結果（Current の反例）

1. マウント直後、Realtime の `SUBSCRIBED` で `handleRealtimeChange` が走り、fetch #1 が発行される。サーバーは追加前の一覧を読む。
2. 別の端末で商品が追加され、`postgres_changes` の通知で fetch #2 が発行される。サーバーは追加後の一覧を読む。
3. #2 の応答が先に届き、追加された商品が表示される。
4. #1 の応答が遅れて届き（Lambda のコールドスタートなど）、`setItems` で追加前の一覧に戻る。
5. 他に保留中のものは無いので、次の変更まで古い一覧が表示されたままになる。

同じ形で、削除した商品が再表示されることもある（削除前に読んだ fetch が、削除後の再取得より遅れて届く）。

### 部分的な修正の反例

- `RealtimeOnlyGuard`: 自分の変更後の再取得が古い一覧を読み、Realtime 経由の新しい結果より後に届いて上書きする。
- `PerPathGuard`: トークン更新で main fetch effect が古い一覧を読み、Realtime 経由の新しい結果より後に届いて上書きする（main fetch effect の `cancelled` は、自分の次の run に対してしか効かない）。

## モデルとコードの対応

| モデル | コード |
|-------|-------|
| `db`（版番号） | アクティブグループの `stock_items` の行。書き込みのコミットごとに +1 |
| `shown` | `useStockItems.ts` の `items` state |
| `Init` の `shown = 0`、`notes = 1` | SSR の `initialItems` で初期化し、最初の main fetch effect をスキップ（`consumedInitialItemsRef`）。購読確立時の `SUBSCRIBED` が 1 回 onChange を呼ぶ |
| `RemoteWrite` | 他の端末・家族の書き込み。Realtime の通知が 1 件増える |
| `SelfWrite` + `IssueMutationRefetch`（kind `"mutation"`） | `handleCreate` / `handleSave` / `handleToggleWantToBuy` / `handleConfirmDelete` / `handleImageSelect` が REST の書き込みを `await` した後、`fetchStockItems` を発行する。自分の書き込みにも Realtime 通知が来る |
| `Deliver`（kind `"realtime"`） | `useStockItemsRealtime.ts` の `postgres_changes` コールバック、および `SUBSCRIBED` コールバックが `onChangeRef.current()`（= `handleRealtimeChange`）を呼ぶ |
| `TokenRefresh`（kind `"token"`） | `contexts/AuthContext.tsx` の `onAuthStateChange`（TOKEN_REFRESHED）→ `setSession` で `accessToken` が変わり、`useStockItems.ts` の main fetch effect が再実行される |
| `Dropped` の `f.seq # lastToken` | main fetch effect の cleanup が立てる `cancelled` |
| `Read(f)` | Go API `GET /api/stock-items`（`handler/stock_item.go` の List → `repository/stock_item_pg.go` の 1 回の SELECT）。1 つの不可分なステップ |
| `Resolve(f)` | `.then((data) => setItems(data))`。`Dropped(f)` なら反映しない |

## 範囲と前提（検証していないこと）

- 1 つの振る舞いにつき、書き込みは最大 2 回（`MaxWrites = 2`）、トークン更新は最大 1 回（`MaxTokenRefreshes = 1`）まで。それを超える回数は通常の実行では調べていない。`MaxWrites = 3` でも `Fixed` が pass し、他の 3 つが fail することは、2026-11-10 に一度確認した（`Fixed` は約 2 分半、7,100 万状態）。
- fetch は必ず成功する。失敗（`.catch(() => {})`）すると、ガード付きの設計でも古い一覧が残りうるが、モデルの外。
- `handleToggleWantToBuy` の楽観的更新と、失敗時の `setItems(previousItems)` によるロールバックは扱っていない。これも `setItems` の経路なので、修正時には共有の番号との関係を考える必要がある。
- グループ切り替え（`effectiveGroupId` の変化）は扱っていない。
- Realtime の通知が取りこぼされないこと（Issue #247）を前提にしている。
- 判定はモデルについてのもの。TypeScript のコードを直接読んではいない。コードとの対応は上の表と、下の手順でエージェントが保つ。

## 対象コードと同期コミット

- **同期コミット:** `26b115f71464d32ab421ecc17de0e33708f98fea`
- **対象コード:**
  - `frontend/src/app/stock-items/useStockItems.ts`（`handleRealtimeChange`、mutation ハンドラの再取得、main fetch effect）
  - `frontend/src/lib/useStockItemsRealtime.ts`
  - `frontend/src/contexts/AuthContext.tsx`（`session` の更新）
  - `backend/handler/stock_item.go`（List）
  - `backend/repository/stock_item_pg.go`（List）

この 2 つは `scripts/check.sh` の `SYNC_COMMIT` / `COVERED` にも書いてある。必ず両方を同時に更新する。

## 変更がこの検証に触れるか

`git diff <同期コミット> -- <対象コード>` に差分があれば触れている（`check.sh` が `STALE` で知らせる）。特に次の変更は判定を変える:

- `setItems(data)` の前に順序のチェックを入れる・外す
- `setItems` を fetch の結果で呼ぶ経路を増やす・減らす（新しい mutation ハンドラ、ポーリング、フォーカス時の再取得など）
- main fetch effect の依存配列や `cancelled` の扱いを変える
- 応答ではなく Realtime の payload で `items` を直接更新するようにする
- List が複数回のクエリや、キャッシュを返すようになる

## コードが変わったとき

1. `check.sh` を実行し、`STALE` の差分を読む。
2. 変更をモデルに写す。
   - 既存の `Guard` の値で表せるなら、コードに合う値を `Current.cfg` に書く。たとえば修正 PR で、すべての経路に共有の番号でガードを入れたなら、`Guard = "shared"` にし、`check.sh` の `EXPECT` の `Current` を `pass` にする。経路ごとの番号なら `"perPath"`、Realtime だけなら `"realtimeOnly"` で、どちらも fail が正しい。
   - 既存の値で表せない変更（新しい再取得の経路、payload による直接更新など）なら、`StockItemsSync.tla` にアクションや kind を足す。各アクションは、上の対応表に行を足せるコードを指していること。
3. `check.sh` を実行する。
   - `DIFF` が出て、反例がコードでも起こる順序なら、それは**本物の不具合**。性質やモデルを緩めずに報告する。
   - 反例がコードでは起こり得ない順序なら、**モデルの誤り**（例: コードでは 1 回の操作なのに、モデルで 2 ステップに分けている）。モデルを直し、対応表を更新する。
4. コードとモデルの対応を確認できてから、`SKILL.md` と `check.sh` の同期コミットを、そのとき確認したコミットに進める。確認していないのに同期コミットだけを進めないこと。

## チェック自体が効いているかの確認

`Fixed` が pass する一方で、部分的な修正（`RealtimeOnlyGuard`、`PerPathGuard`）と現行コード（`Current`）は fail する。これで、チェックが部分的な修正を見逃さないことを示している。モデルを変えたら、この 3 つが fail のままであることも確認する。どれかが pass になったら、そのモデル変更でチェックが効かなくなっている。
