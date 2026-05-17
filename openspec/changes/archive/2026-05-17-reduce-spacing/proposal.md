## Why

旧製品（https://pantry-panel.web.app/）と比べて現行アプリはモバイル表示時の余白が大きく、一度に表示できる商品数が少ない。ページ全体の padding・gap を控えめに縮小することで、特にモバイル環境での視認性と一覧性を改善する。

## What Changes

- ヘッダーの上下左右 padding を縮小（`py-4 px-6` → `py-2 px-4`）
- メインコンテンツの上下 padding を縮小（`py-6` → `py-4`）
- フィルターバー下のマージンを縮小（`mb-6` → `mb-4`）
- 商品グリッドの gap を縮小（`gap-4` → `gap-3`）
- `ItemCard`（通常モード）のカード内 padding・gap を縮小（`p-4 gap-4` → `px-3 py-2 gap-3`）

ロジック変更なし。`ItemCardSimple` はすでに十分コンパクトなため変更なし。

## Capabilities

### New Capabilities

なし

### Modified Capabilities

- `stock-items-list`: 商品一覧の表示密度が変わる（より多くの商品が一画面に収まる）
- `ui-style-guide`: ページレイアウトおよびカードの余白仕様が変わる

## Impact

- `frontend/src/app/stock-items/page.tsx` — ヘッダー・メイン・グリッドの padding/gap
- `frontend/src/components/ItemCard.tsx` — カード内 padding・gap
- 既存テストへの影響なし（Tailwind クラスを直接検証するテストは存在しない）
