---
name: stock-items-sync
description: /stock-items の一覧（useStockItems の items）が、Realtime イベントや自分の変更のたびに行う再取得の結果、DB の最新状態に収束するかを TLA+ (TLC) で全順序検査する。useStockItems.ts / useStockItemsRealtime.ts の再取得・setItems・Realtime 購読、または GET /api/stock-items を変更するとき、再取得の順序ガードを入れる・直すとき、「削除した商品が戻ってくる」「古い一覧のまま」系の不具合を調べるときに使う。
---

# stock-items-sync — 一覧の再取得が DB に収束するかの形式検証

## 何を検証しているか

- **約束:** Realtime 通知・自分の変更後の再取得・fetch がすべて落ち着いたとき、画面の一覧（React state `items`）は DB の最新状態と一致する。
- **破れたときの害:** 家族が追加・削除した商品が画面で消えたり戻ったりし、次の変更が起きるまでそのまま残る。
- **方法:** `model/StockItemsSync.tla` の小さなモデルを TLC で検査する。DB への書き込み、Realtime 通知の配達、fetch の発行、サーバーでの SELECT、応答の到着が、**どの順番で起きても**よいとして全状態を探索する。テストでは届く順番を 1 つずつしか試せないため、TLA+ を選んだ。

## 実行

リポジトリのルートから実行する（Java は `.mise.toml` で固定、`tla2tools.jar` v1.7.4 は初回に `~/.cache/pantry-panel-tla/` へダウンロードされ、SHA-256 を照合する）。

```bash
.claude/skills/stock-items-sync/scripts/check.sh
```

10 秒程度で終わる。出力の読み方:

| 行 | 意味 |
|----|------|
| `OK <config>: <結果> (expected <期待>)` | その設定の判定が期待どおり |
| `DIFF <config>: ...` | 期待と違う。ログのパスが出るので、反例（`State 1..n`）を読む。終了コード 1 |
| `STALE covered code changed since sync commit` | 下の「対象コード」が同期コミットから変わっている。判定はまだ古いコードのモデルについてのもの。終了コード 2（他に DIFF が無い場合） |

## 設定と期待される判定

| 設定 | コードとの対応 | 期待 |
|------|---------------|------|
| `Current` | **同期コミット時点のコード**。どの再取得も届いた応答をそのまま `setItems(data)` する | **fail（既知の検出結果）** |
| `Fixed` | すべての再取得（Realtime 経由・変更後）で、すでに反映した応答より前に発行された fetch の応答を捨てる | pass |
| `RealtimeOnlyGuard` | `handleRealtimeChange` にだけ上記のガードを入れ、変更後の再取得は素通し | fail |

`Current` の fail はチェックの故障ではなく、現行コードの不具合である。モデルや性質を弱めて pass にしないこと。

### 既知の検出結果（Current の反例）

1. マウント直後、Realtime の `SUBSCRIBED` で `handleRealtimeChange` が走り、fetch #1 が発行される。サーバーは追加前の一覧を読む。
2. 別の端末で商品が追加され、`postgres_changes` の通知で fetch #2 が発行される。サーバーは追加後の一覧を読む。
3. #2 の応答が先に届き、追加された商品が表示される。
4. #1 の応答が遅れて届き（Lambda のコールドスタートなど）、`setItems` で追加前の一覧に戻る。
5. 他に保留中のものは無いので、次の変更まで古い一覧が表示されたままになる。

同じ形で、削除した商品が再表示されることもある（削除前に読んだ fetch が、削除後の再取得より遅れて届く）。

## モデルとコードの対応

| モデル | コード |
|-------|-------|
| `db`（版番号） | アクティブグループの `stock_items` の行。書き込みのコミットごとに +1 |
| `shown` | `useStockItems.ts` の `items` state |
| `Init` の `shown = 0`、`notes = 1` | SSR の `initialItems` で初期化し、最初の fetch effect をスキップ（`consumedInitialItemsRef`）。購読確立時の `SUBSCRIBED` が 1 回 onChange を呼ぶ |
| `RemoteWrite` | 他の端末・家族の書き込み。Realtime の通知が 1 件増える |
| `SelfWrite` + `IssueMutationRefetch` | `handleCreate` / `handleSave` / `handleToggleWantToBuy` / `handleConfirmDelete` / `handleImageSelect` が REST の書き込みを `await` した後、`fetchStockItems` を発行する。自分の書き込みにも Realtime 通知が来る |
| `Deliver` | `useStockItemsRealtime.ts` の `postgres_changes` コールバック、および `SUBSCRIBED` コールバックが `onChangeRef.current()`（= `handleRealtimeChange`）を呼ぶ |
| `Read(f)` | Go API `GET /api/stock-items`（`handler/stock_item.go` の List → `repository/stock_item_pg.go` の 1 回の SELECT）。1 つの不可分なステップ |
| `Resolve(f)` | `.then((data) => setItems(data))`。ガードの有無は `GuardRealtime` / `GuardMutation` で切り替える |

## 範囲と前提（検証していないこと）

- 書き込みは 1 つの振る舞いで最大 3 回（`MaxWrites = 3`）。それを超える回数の書き込みは調べていない。
- fetch は必ず成功する。失敗（`.catch(() => {})`）すると、ガード付きの設計でも古い一覧が残りうるが、モデルの外。
- `handleToggleWantToBuy` の楽観的更新と、失敗時の `setItems(previousItems)` によるロールバックは扱っていない。
- グループ切り替え（`effectiveGroupId` の変化）と、main fetch effect の `cancelled` ガードは扱っていない。
- Realtime の通知が取りこぼされないこと（Issue #247）を前提にしている。
- 判定はモデルについてのもの。TypeScript のコードを直接読んではいない。コードとの対応は上の表と、下の手順で人（エージェント）が保つ。

## 対象コードと同期コミット

- **同期コミット:** `26b115f71464d32ab421ecc17de0e33708f98fea`
- **対象コード:** `frontend/src/app/stock-items/useStockItems.ts`（`handleRealtimeChange`、mutation ハンドラの再取得、main fetch effect）、`frontend/src/lib/useStockItemsRealtime.ts`、`backend/handler/stock_item.go`（List）、`backend/repository/stock_item_pg.go`（List）

この 2 つは `scripts/check.sh` の `SYNC_COMMIT` / `COVERED` にも書いてある。必ず両方を同時に更新する。

## 変更がこの検証に触れるか

`git diff <同期コミット> -- <対象コード>` に差分があれば触れている（`check.sh` が `STALE` で知らせる）。特に次の変更は判定を変える:

- `setItems(data)` の前に順序のチェックを入れる・外す
- 再取得の経路を増やす・減らす（新しい mutation ハンドラ、ポーリング、フォーカス時の再取得など）
- 応答ではなく Realtime の payload で `items` を直接更新するようにする
- List が複数回のクエリや、キャッシュを返すようになる

## コードが変わったとき

1. `check.sh` を実行し、`STALE` の差分を読む。
2. 変更をモデルに写す。
   - 既存の設定で表せるなら、コードに合う設定を `Current` として扱う。たとえば修正 PR ですべての再取得にガードを入れたら、`Current.cfg` を `GuardRealtime = TRUE` / `GuardMutation = TRUE` にし、`check.sh` の `EXPECT` の `Current` を `pass` にする。
   - 既存の定数で表せない変更（新しい再取得の経路、payload による直接更新など）なら、`StockItemsSync.tla` にアクションを足す。各アクションは、上の対応表に行を足せるコードを指していること。
3. `check.sh` を実行する。
   - `DIFF` が出て、反例がコードでも起こる順序なら、それは**本物の不具合**。性質やモデルを緩めずに報告する。
   - 反例がコードでは起こり得ない順序なら、**モデルの誤り**（例: コードでは 1 回の操作なのに、モデルで 2 ステップに分けている）。モデルを直し、対応表を更新する。
4. コードとモデルの対応を確認できてから、`SKILL.md` と `check.sh` の同期コミットを、そのとき確認したコミットに進める。確認していないのに同期コミットだけを進めないこと。

## チェック自体が効いているかの確認

`Fixed` を pass させたまま、ガードを片方だけにした `RealtimeOnlyGuard` が fail することで、チェックが「部分的な修正」を見逃さないことを示している。モデルを変えたら、`RealtimeOnlyGuard` と `Current` が fail のままであることも確認する。どちらかが pass になったら、そのモデル変更でチェックが効かなくなっている。
