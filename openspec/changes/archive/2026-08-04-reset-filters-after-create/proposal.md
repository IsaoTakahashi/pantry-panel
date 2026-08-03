## Why

商品追加は「買いたい物が既に登録済みか、検索文字列と買いたいだけトグルで確認 → 見つからなければそのまま新規作成」という流れで使われる。作成後は絞り込み条件が不要になるが、現状は残り続けるため、ユーザーは毎回手動でフィルターを解除する必要がある。

## What Changes

- 商品の新規作成が成功した時点で、`FilterCondition`（`searchText` / `wantToBuyOnly` / `category`）をすべて初期値にリセットする
- 作成が失敗した場合（例: 409 重複エラー）はフィルターを維持し、モーダルも開いたままにする（既存挙動を変更しない）
- リセットは「商品を追加」ボタン経由・URL登録フロー経由のどちらの作成でも同じ `CreateItemModal` インスタンスを通るため一律に適用される

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `stock-items-list`: 商品作成成功時にフィルター（検索文字列 / wantToBuyOnly / category）をリセットする要件を追加する。既存の「CreateItemModal は filter のカテゴリをデフォルト選択にする」（モーダルを開く時のプリフィル挙動）は変更しない

## Impact

- `frontend/src/app/stock-items/StockItemsClient.tsx`: `CreateItemModal` に渡す `onCreate` をラップし、作成成功後に `setFilter` で初期値に戻す
- `frontend/src/app/stock-items/page.test.tsx`: 作成成功後にフィルターがリセットされることを検証するテストケースを追加

## ユーザーシナリオとテスト設計

### フロントエンドシナリオ

#### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | 検索文字列でフィルターした状態から商品作成に成功すると `searchText` がリセットされる | - | Frontend Integration |
| S-2 | 買いたいだけフィルター ON の状態から商品作成に成功すると `wantToBuyOnly` がリセットされる | - | Frontend Integration |
| S-3 | カテゴリでフィルターした状態から商品作成に成功すると `category` がリセットされる | - | Frontend Integration |
| S-4 | 商品作成が失敗（409重複エラー）した場合、フィルターは維持されモーダルは開いたまま | - | Frontend Integration |
| S-5 | URL登録フロー経由で商品作成に成功した場合も同じ `CreateItemModal` インスタンスを通るためフィルターがリセットされる | - | Frontend Integration |

---

#### S-1: 検索文字列フィルターが作成成功でリセットされる
**Given:** `fetchStockItems` が商品一覧を返すようモックされ、`searchbox`（検索欄）に `"醤油"` を入力してフィルターがかかっている状態
**When:** 「商品を追加」ボタンから `CreateItemModal` を開き、フォームを送信して `createStockItem`（`@/lib/api` モック）が成功する
**Then:** モーダルが閉じ、`searchbox` の値が空文字に戻る（＝検索結果が絞り込み前の全件表示に戻る）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | `page.test.tsx` に `StockItemsPage` をレンダリングし、`createStockItem`/`fetchStockItems` を `vi.mock("@/lib/api")` でモック。送信後 `screen.getByRole("searchbox")` の value が `""` に戻ることを確認 | 既存の「検索テキスト入力済み状態でプリフィルされる」テスト（S-1近傍）と同ファイルに追加し、モック方法を揃える |

**E2E判定:** No
**理由:** 判断ツリー Q1「ブラウザを起動しないと検証できないか」→ No。フィルターリセットは `StockItemsClient` の React state 更新であり、DOM 上は `searchbox` の value や `FilterBar` の表示状態として RTL + jsdom で確認できる。外部API（Google CSE・Supabase Realtime）も関与しない REST CRUD のみのため、Q2 の Preview 判定も不要。Q3「複数コンポーネントをまたぐ連携」→ Yes（`StockItemsClient` → `CreateItemModal` → `useStockItems.handleCreate` の連携）なので Frontend Integration が妥当

---

#### S-2: 買いたいだけフィルターが作成成功でリセットされる
**Given:** 「買いたいものだけ」フィルターボタンをクリックして `wantToBuyOnly: true` の状態
**When:** 「商品を追加」ボタンから `CreateItemModal` を開き、フォームを送信して作成が成功する
**Then:** モーダルが閉じ、「買いたいものだけ」ボタンの `aria-pressed` が `false` に戻る（＝`wantToBuyOnly` が絞り込み前の全件表示に戻る）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | 送信後 `screen.getByRole("button", { name: "買いたいものだけ" })` の `aria-pressed` が `"false"` に戻ることを確認。既存の「買い物リストフィルタ ON 状態でプリフィルされる」テストと対の構成にする | — |

**E2E判定:** No
**理由:** S-1 と同じ判断ツリー適用結果。トグルの `aria-pressed` は RTL で直接検証できる状態であり、ブラウザ実描画（アニメーション・レイアウト）を要する検証ではない

---

#### S-3: カテゴリフィルターが作成成功でリセットされる
**Given:** フィルターバーの「カテゴリ」select で `"調味料"` を選択している状態
**When:** 「商品を追加」ボタンから `CreateItemModal` を開き、フォームを送信して作成が成功する
**Then:** モーダルが閉じ、フィルターバー側の「カテゴリ」select の値が初期値（未選択）に戻る

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | フィルターバー側の「カテゴリ」select（`screen.getAllByLabelText("カテゴリ")` から `[role="dialog"]` 外の要素を特定）の value が初期値に戻ることを確認 | 既存の「カテゴリフィルタ選択済み状態でプリフィルされる」テストと同じ要素特定方法（`.closest('[role="dialog"]')`）を流用 |

**E2E判定:** No
**理由:** S-1 と同じ。select の value は RTL で直接検証可能で、ブラウザレンダリングに依存しない

---

#### S-4: 作成失敗時はフィルターを維持する
**Given:** `searchbox` に `"醤油"` を入力してフィルターがかかっている状態
**When:** 「商品を追加」ボタンから `CreateItemModal` を開き、フォームを送信して `createStockItem` が `Error("HTTP 409")` で reject する
**Then:** `searchbox` の値は `"醤油"` のまま維持され、モーダルは閉じずインラインエラー「その商品は登録済みです」が表示される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | `vi.mocked(createStockItem).mockRejectedValue(new Error("HTTP 409"))` で失敗させ、送信後も `searchbox` の値が `"醤油"` のまま・`screen.getByRole("dialog")` が存在し続けること・エラーメッセージが表示されることを確認 | `setFilter` が呼ばれない（`handleCreate` の reject で `await` がそのまま reject し後続処理に到達しない）ことの回帰防止が主目的 |

**E2E判定:** No
**理由:** 失敗系もブラウザ固有の挙動（アニメーション・実際のネットワークエラー）を伴わず、fetch mock による reject と RTL のアサーションで十分に再現・検証できる。外部API も関与しない

---

#### S-5: URL登録フロー経由の作成でもフィルターがリセットされる
**Given:** 「買いたいものだけ」フィルターを ON にした状態で、`UrlRegistrationModal`（`aria-label="URLから追加"` ボタン）経由で `handleExtracted` が呼ばれ `CreateItemModal` がプリフィル済みで開く
**When:** その `CreateItemModal` のフォームを送信して作成が成功する
**Then:** 「商品を追加」ボタン経由の場合と同じ `CreateItemModal` インスタンス・同じ `onCreate` ラッパーを通るため、`wantToBuyOnly` が `false` にリセットされる

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | `UrlRegistrationModal` を経由して `CreateItemModal` を開かせ（`handleExtracted` 相当の操作）、送信成功後にフィルターの `wantToBuyOnly` が `false` に戻ることを確認 | S-1〜S-3 とは異なるエントリーポイントであることを示すため、`onCreate` が単一のラッパー関数に集約されている設計（design.md 参照）の回帰防止として重要 |

**E2E判定:** No
**理由:** URL登録フローの導線自体は既存機能で別途カバーされており、本シナリオが検証したいのは「フィルターリセットのロジックがエントリーポイントに依存しないこと」のみ。これは `handleExtracted` → `isModalOpen: true` という状態遷移を RTL で再現すれば足り、ブラウザや外部APIは不要

---

### バックエンドシナリオ

（なし）本変更はフロントエンドのローカル state（`FilterCondition`）のみを対象とし、API・DBへの変更を含まないため、バックエンドシナリオは存在しない。
