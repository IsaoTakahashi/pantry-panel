# 在庫アイテムの登録・編集・削除

アクティブグループの在庫アイテムを UI から登録・編集・削除する。変更は Go API（`/api/stock-items`）を通って Supabase Postgres に保存され、リロード後の SSR（`/stock-items` の初期データ取得）で読み戻される。

## Sub-features

- `create` — `商品を追加` から名前とカテゴリを入力して登録する
- `edit` — カードの商品名ボタンから編集ダイアログを開き、名前やカテゴリを `保存` する
- `delete` — カードの `削除` から確認ダイアログを経て削除する
- `want-to-buy` — カードの `want to buy` トグル（`aria-pressed`）。削除の前提にもなる（下記 Gotchas）

## How to get to it (user POV)

- `/stock-items` の右上にある `商品を追加` ボタン
- 一覧の商品カード（`article`）の商品名ボタン → 編集
- 商品カードの `削除` ボタン → 確認ダイアログの `確認`

## Driving it with Playwright (drive.sh)

```bash
.claude/skills/verify/scripts/drive.sh stock-crud.spec.ts
```

付属の journey `journeys/stock-crud.spec.ts` の流れ:

- **登録.** `getByRole("button", { name: "商品を追加" })` → ダイアログで `getByLabel("名前")` に入力し、`getByLabel("カテゴリ", { exact: true })` で `調味料` を選ぶ → `getByRole("button", { name: "追加", exact: true })`。ダイアログが消え、`article[name=<商品名>]` が表示される
- **永続化.** `page.reload()` の後も同じカードが表示される（DB から読み戻されている）
- **削除.** カード内の `削除` → `確認`。カードが消え、リロード後も 0 件のまま
- **証跡.** `screenshots/01-initial`、`02-created`、`03-after-reload`、`04-deleted-after-reload`

編集の手順は `frontend/e2e/stock-items.spec.ts`（商品名ボタン `name: new RegExp(itemName)` → `保存`）にあり、`drive.sh e2e/stock-items.spec.ts` で実行できる。

## Gotchas

- `wantToBuy=true` のアイテムは削除できない（API が拒否する）。先に `want to buy` を外す
- カードはフェードで出入りする。スクリーンショットは journey の `shot()` を使い、アニメーションが終わってから撮る
- 「追加」ボタンは `exact: true` を付けないと、`商品を追加` にもマッチする
