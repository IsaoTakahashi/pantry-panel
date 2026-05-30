## Why

URL登録モーダルを開く際、ユーザーはクリップボードにコピーしたURLを手動でペーストする必要があり、操作ステップが多い。リンクボタンをタップした時点でクリップボードの内容を自動読み取り・自動入力することで、PC・Android では実質1タップで抽出まで完了できるようにする。

## What Changes

- リンクボタンクリック（`UrlRegistrationModal` open時）にクリップボードを自動読み取りする
- クリップボードに有効な URL（http / https）が含まれる場合：URLをフォームに入力し、自動でsubmit（抽出開始）する
- クリップボードに文字列はあるがURLではない場合：モーダルを開きつつ「URLの読み取りに失敗しました」の通知と読み取れた文字列を表示する
- クリップボードの読み取りに失敗した場合（権限拒否など）：モーダルを開きつつ「URLの読み取りに失敗しました」の通知のみ表示する
- クリップボードが空の場合：従来通りモーダルをただ開く
- 通知はユーザーが手動でURLを入力し始めると消える

## Capabilities

### New Capabilities
- なし

### Modified Capabilities
- `url-product-extraction`: URLの登録エントリーポイントの挙動変更（リンクボタンクリック時にクリップボード自動読み取り → 自動入力 → 自動検索）

## Impact

- `frontend/src/components/UrlRegistrationModal.tsx`: クリップボード読み取りロジック・通知UIの追加
- `frontend/src/components/UrlRegistrationModal.test.tsx`: クリップボード関連テストの追加
- `navigator.clipboard.readText()` APIに依存（HTTPS必須、iOS では毎回OSシステムダイアログが表示される）
- E2Eテスト: Playwright でクリップボードAPIはページコンテキスト経由で操作可能なため、E2E Mock での検証が可能
