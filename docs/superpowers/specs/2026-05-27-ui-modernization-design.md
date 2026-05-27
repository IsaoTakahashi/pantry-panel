# UI Modernization Design

**Date:** 2026-05-27
**Scope:** Header, FilterBar, ItemCard, ItemCardSimple（追加ボタン含む）

## 背景

商品追加モーダル（`BaseModal` / `CreateItemModal`）を先にモダン化した結果、以下のデザイン言語が確立された：

- `rounded-2xl` / `rounded-xl` — コンテナ・インタラクション要素
- `border-2 border-slate-200` — 入力・セレクト枠
- `text-xs font-bold text-slate-400 uppercase tracking-widest` — ラベル
- `bg-[#00d1b2]` / `bg-[#00c4a7]` — プライマリ teal アクセント
- slate 系ニュートラル（`slate-100` / `slate-200` / `slate-400` / `slate-900`）

ヘッダーと商品一覧がこの言語から外れており、統一感を出すために揃える。

## デザイン方針

**ミニマル ホワイト** — 白背景を軸に、teal をアクセントとして使うシンプルなデザイン。

## 変更コンポーネント

### 1. ヘッダー（`StockItemsClient.tsx` 内）

| 項目 | 現行 | 変更後 |
|------|------|--------|
| 背景 | `bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb]` | `bg-white border-b border-slate-100` |
| ロゴ | テキストのみ `text-2xl font-bold` | teal ロゴアイコン（`w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d1b2] to-[#0d9488]`）+ `text-xl font-extrabold text-slate-900 tracking-tight` |
| GroupSwitcher | `text-sm text-white` 文脈 | `chip-btn`（`bg-slate-100 rounded-lg text-slate-600`）スタイルに合わせる |
| 招待リンクボタン | `bg-black/20 text-white rounded-lg` | `bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200` |
| サインアウトボタン | `bg-black/20 text-white rounded-lg` | `bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200` |

### 2. FilterBar（`FilterBar.tsx`）

| 項目 | 現行 | 変更後 |
|------|------|--------|
| 検索インプット | `border border-gray-300 rounded` | `border-2 border-slate-200 rounded-xl focus:border-[#00d1b2]` |
| 買いたいフィルターボタン | `rounded bg-gray-200` / `rounded bg-blue-500` | `rounded-xl bg-slate-100 text-slate-400` / `rounded-xl bg-blue-500 text-white` |
| カテゴリセレクト | `border border-gray-300 rounded` | `border-2 border-slate-200 rounded-xl focus:border-[#00d1b2]` |
| 表示モード切替トグル | `rounded-full bg-gray-200` + 内部 `rounded-full` | `rounded-xl bg-slate-100` + 内部 `rounded-lg` |

### 3. 追加ボタン（`StockItemsClient.tsx` 内）

| 項目 | 現行 | 変更後 |
|------|------|--------|
| 「商品を追加」ボタン | `rounded` | `rounded-xl` |
| URLから追加ボタン | `rounded` | `rounded-xl` |

### 4. ItemCard（`ItemCard.tsx`）

| 項目 | 現行 | 変更後 |
|------|------|--------|
| カード外枠 | `rounded-lg border bg-white shadow-sm` | `rounded-2xl border-2 border-slate-100 bg-white shadow-sm` |
| wantToBuy 状態 | 変化なし | `border-blue-200 bg-blue-50/30`（状態を視覚的に明示） |
| サムネイル | `rounded overflow-hidden` | `rounded-xl border-2 border-slate-100` |
| カテゴリバッジ | `bg-[#ebfffc] text-[#00947e]` | `bg-teal-50 text-teal-700`（Tailwind クラスに統一） |
| 外部リンクボタン | `text-gray-400 hover:text-gray-600` | `text-slate-300 hover:text-slate-500` |
| wantToBuy ボタン（ON） | `text-blue-500` / `text-gray-300` | 変化なし（色は現行維持、形状のみ） |
| 削除ボタン | `bg-[#ff3860] text-white` / disabled=`bg-gray-300` | `bg-red-50 text-red-300 rounded-xl` / disabled=`bg-slate-100 text-slate-200` |
| 全アクションボタン | 固定 `w-11 h-8 rounded` | `w-9 h-9 rounded-xl` に統一 |

### 5. GroupSwitcher（`GroupSwitcher.tsx`）

トリガーボタンが `bg-black/20 text-white` でハードコードされており、白ヘッダーでは見えなくなる。

| 項目 | 現行 | 変更後 |
|------|------|--------|
| トリガーボタン | `bg-black/20 hover:bg-black/30 text-white rounded-lg` | `bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg` |

ドロップダウン内部（`bg-white border border-gray-200 rounded-lg`）は変更なし。

### 6. ItemCardSimple（`ItemCardSimple.tsx`）

`ItemCard` と同じ変更方針を適用する（外枠の `rounded` / `border` を `rounded-2xl` / `border-2 border-slate-100` へ）。詳細は実装時に `ItemCard` に合わせる。

## スコープ外

- `EditItemModal.tsx` / `UrlRegistrationModal.tsx` / `ImageSelectionModal.tsx` — 別途 or 後続タスク
- `GroupSwitcher.tsx` の内部実装（外側のラッパーのスタイルのみ変更）
- 動作ロジック・状態管理への変更なし

## テスト方針

デザイン変更のみのため、既存テストは構造変更なしで通過する想定。ただし以下を確認する：

- Vitest: `ItemCard.test.tsx`、`ItemCardSimple.test.tsx`、`FilterBar.test.tsx` がクラス名変更で壊れていないか
- E2E（Playwright Mock）: `stock-items.spec.ts`、`filter.spec.ts` の主要フローが通過するか
- 手動確認: dev server で実際の表示を目視確認
