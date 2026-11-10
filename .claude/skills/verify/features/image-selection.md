# 商品画像の設定

商品カードの `画像を設定` から画像検索のモーダル（`画像を選択`）を開き、検索結果から 1 枚を選ぶと、カードに画像が表示される。画像を解除するとプレースホルダーに戻る。

## Sub-features

- `open-cancel` — モーダルを開いて、キャンセルまたは Escape で閉じる
- `select` — 検索結果の画像ボタンをクリック → モーダルが閉じ、カードに `img` が出る
- `retry` — 検索がエラーになったとき、`再試行` が表示される
- `clear` — 画像を解除してプレースホルダーに戻す

## How to get to it (user POV)

- 商品カード（`article`）の画像エリアにある `画像を設定` ボタン

## Driving it with Playwright (drive.sh)

```bash
.claude/skills/verify/scripts/drive.sh e2e/image-selection.spec.ts
```

- **選択.** `article.getByRole("button", { name: "画像を設定" })` → `getByRole("dialog", { name: "画像を選択" })` → 画像を含む最初の `button` → モーダルが閉じ、`article.locator("img")` が表示される
- **永続化の確認.** spec はリロードしない。保存まで証明するなら、`journeys/` に「選択 → リロード → `img` が残る」journey を追加する

## Gotchas

- `mock` project では `/api/image-search` を `STUB_IMAGES`（picsum.photos）で stub する。Google CSE は外部システムとの境界。`.env.e2e` に `GOOGLE_CSE_*` が無ければ backend は 503 を返す
- stub の画像は picsum.photos から取得するので、オフラインでは画像の読み込みが失敗する
