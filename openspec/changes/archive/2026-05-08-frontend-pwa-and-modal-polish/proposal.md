## Why

Phase 2.5c（Vercel デプロイ）に進む前に、Frontend の細かな品質改善 6 件をまとめて対応する。本番公開時にユーザーが目にする最初の体験を整える + バグ修正 + UX 改善。

## What Changes

1. **PWA メタデータ + アイコン**: `app/manifest.ts` と `metadata.icons` を整備し、ブラウザでのインストール（"add to home screen"）が可能になる。アイコン画像はユーザーが `frontend/public/icon.png` (512×512 PNG) を配置する
2. **ページタイトル**: `layout.tsx` の `metadata.title` を `"Create Next App"` → `"Pantry Panel"` に変更
3. **Root リダイレクト**: `/` にアクセスすると `/stock-items` にリダイレクト（Create Next App ボイラープレート削除）
4. **モーダル背景の修正**: `CreateItemModal` / `EditItemModal` の Tailwind v4 非対応な `bg-opacity-50` を `bg-black/50` (slash 構文) に書き換え + `z-50` + `aria-modal="true"` 追加。透けて見える / 操作可能な問題を解消
5. **モーダル input のテキスト色**: input / select に `text-gray-900` を追加（FilterBar と統一）
6. **デフォルトカテゴリの自動選択**: `CreateItemModal` を開いた時のカテゴリ初期値を、フィルタの選択値に合わせる
   - フィルタ「全部」(`category: null`) → 初期値 `"★"`
   - フィルタ「調味料」など → 初期値 同じ値
   - 「選択してください」プレースホルダは削除（常にデフォルト値が入るため）

## Capabilities

### New Capabilities

- `frontend-pwa`: Frontend が PWA としてインストール可能で、適切なアイコン / マニフェストを持つこと

### Modified Capabilities

- `stock-items-list`: Root (`/`) は `/stock-items` にリダイレクトする要件を追加 / モーダルの初期カテゴリと UX 修正を反映

## Impact

- 変更:
  - `frontend/src/app/layout.tsx` — title / icons / manifest metadata
  - `frontend/src/app/page.tsx` — ボイラープレート削除 → redirect
  - `frontend/src/components/CreateItemModal.tsx` — backdrop 修正、text 色、initialCategory prop 追加
  - `frontend/src/components/CreateItemModal.test.tsx` — initialCategory のテスト
  - `frontend/src/components/EditItemModal.tsx` — backdrop 修正、text 色（同様の問題があれば）
  - `frontend/src/components/EditItemModal.test.tsx` — 必要なら更新
  - `frontend/src/app/stock-items/page.tsx` — initialCategory を CreateItemModal に渡す
  - `frontend/src/app/stock-items/page.test.tsx` — 必要なら更新
- 新規:
  - `frontend/src/app/manifest.ts` — PWA manifest
- ユーザー作業: `frontend/public/icon.png` (512×512 PNG) を配置する
- バックエンド・API・DB の変更なし
