# フィルタ（検索・カテゴリ・買いたいもの）

一覧の上部で、テキスト検索・カテゴリ・「買いたいものだけ」を組み合わせて、表示する商品を絞り込む。

## Sub-features

- `search` — `getByLabel("検索")` への入力で、商品名を部分一致で絞り込む。`クリア` で解除する
- `category` — カテゴリの select（初期値 `全部`）
- `want-to-buy-only` — `買いたいものだけ` ボタン（カートのアイコン）
- `combined` — 検索とカテゴリの組み合わせ

## How to get to it (user POV)

- `/stock-items` の左上: 検索欄、カートのボタン、カテゴリの select

## Driving it with Playwright (drive.sh)

```bash
.claude/skills/verify/scripts/drive.sh e2e/filter.spec.ts
```

- **前提.** spec の `createItem` で `牛乳-<suffix>`（飲み物）と `醤油-<suffix>`（調味料）を UI から作る
- **検索.** `検索` に `牛乳` と入力 → 牛乳のカードだけが表示される → `クリア` で両方が表示される
- **買いたいもの.** 牛乳のカードの `want to buy` を `aria-pressed="true"` にしてから `買いたいものだけ` → 牛乳だけが表示される
- **証跡.** spec はスクリーンショットを撮らないが、trace（`test-results/**/trace.zip`）に各ステップの画面が残る。画像が必要なら `journeys/` にスクリーンショット付きの journey を書く

## Gotchas

- spec は最後に UI から削除して後片付けする。`wantToBuy` を外してから削除しないと失敗する
- フィルタの状態がリロード後も残るかどうかは、このマップではまだ確認していない
