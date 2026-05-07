## Why

商品数が増えるとスクロール量が増え、モバイル PWA では一覧の見通しが悪くなる。表示モードを切り替えられるようにすることで、目的によって使い分けられる（ざっと俯瞰したい時はシンプル、編集・削除作業時は通常）。旧仕様にも同等のシンプルビュー機能があった。

## What Changes

- 商品一覧ページに **表示モードトグル（通常 / シンプル）** を追加する
- シンプルモード用の新コンポーネント `ItemCardSimple` を追加し、1行のコンパクト表示で `[🛒][カテゴリ][商品名]` をレンダリングする
- シンプルモードでは **削除ボタンを出さない**（編集はカードクリックで normal と同じ操作）
- 表示モード state は **永続化しない**。デフォルトは `"normal"`
- トグルは `FilterBar` の3段目に配置し、segmented control 風 UI で実装する

## Capabilities

### New Capabilities

- `view-mode-switch`: 商品一覧の表示モード切替機能。通常カードとシンプル1行表示を切り替えられる

### Modified Capabilities

（なし）

## Impact

- `frontend/src/app/stock-items/page.tsx`: `viewMode` state とコンポーネント切替を追加
- `frontend/src/components/FilterBar.tsx`: 3段目にトグル UI を追加。props に `viewMode`, `onViewModeChange` を追加
- `frontend/src/components/ItemCardSimple.tsx`: 新規（テスト含む）
- バックエンド・API・DB の変更なし
