# URL から商品登録

商品ページの URL を入力すると、backend が名前と画像を抽出する（SSE で進捗を返す `/api/extract-from-url/stream`）。抽出結果を入れた状態で登録ダイアログが開く。

## Sub-features

- `open` — `URLから追加` ボタンで URL 入力モーダルを開く
- `extract-stream` — `抽出` を押すと処理のステップ一覧が表示され、完了すると登録ダイアログの `名前` に値が入る
- `extract-failed` — 抽出に失敗すると「商品情報を取得できませんでした。手動で入力してください」と表示される
- `clipboard` — クリップボードに有効な URL があるとき、リンクボタンから自動で抽出が始まる

## How to get to it (user POV)

- `/stock-items` の `URLから追加` ボタン（`商品を追加` の右）
- リンクアイコンのボタン（クリップボード経由。`e2e/url-registration.spec.ts` の最後のテストを参照）

## Driving it with Playwright (drive.sh)

```bash
.claude/skills/verify/scripts/drive.sh e2e/url-registration.spec.ts
```

- **フルフロー.** `URLから追加` → `getByRole("dialog").getByRole("textbox")` に URL を入力 → `抽出` → `getByLabel("名前")` が抽出結果の値になる
- **証跡.** trace と HTML レポート

## Gotchas

- spec は `/api/extract-from-url/stream` を `page.route` で stub している（外部の商品ページ取得と AI フォールバックは本番でも外部システムとの境界）。本物の抽出を確かめたいときは、stub しない journey を書く。backend の `ANTHROPIC_API_KEY` と `JINA_API_KEY` は `.env.e2e` に無ければ未設定のままで、AI フォールバックは動かない
- URL モーダルと登録ダイアログが一瞬同時に存在するので、`getByRole("dialog")` ではなく `getByLabel("名前")` で待つ
