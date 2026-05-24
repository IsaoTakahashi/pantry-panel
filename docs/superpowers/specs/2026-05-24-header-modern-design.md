# Header Modern Design

**Date:** 2026-05-24
**Scope:** `StockItemsClient.tsx` のヘッダー右側 — グループ切り替え・招待リンク・サインアウトボタン

## 概要

ヘッダー右側の3要素（GroupSwitcher・招待リンク・サインアウト）を、現在の opacity のみのスタイルから、統一感のあるアイコンボタンスタイルに変更する。

## 現状

```jsx
<div className="flex items-center gap-3 text-sm">
  <GroupSwitcher ... />   {/* 白テキスト + ▾ */}
  <a className="opacity-80 hover:opacity-100 underline">招待</a>
  <button className="opacity-80 hover:opacity-100">サインアウト</button>
</div>
```

## 新デザイン仕様

### ボタン共通スタイル

| プロパティ | 値 |
|-----------|-----|
| 背景色 | `bg-black/20 hover:bg-black/30` |
| 角丸 | `rounded-lg` (8px) |
| 高さ | `h-8` (32px) |
| トランジション | `transition-colors` |

### 各要素

| 要素 | 表示内容 | 補足 |
|------|---------|------|
| グループ切り替え | UsersIcon + グループ名 + ChevronDownIcon | 既存 GroupSwitcher のトリガーボタン部分を変更 |
| 招待リンク | MdLink + "招待" | オーナーのみ表示。`<a href="/invite">` を維持（ページ遷移のため button ではなく anchor） |
| サインアウト | LogOutIcon のみ | `title="サインアウト"` でツールチップ |

### アイコンライブラリ

既存の `react-icons/md` を使用する（すでに `MdLink` が使われている）。

使用アイコン：
- `MdGroup` — グループ切り替えトリガー
- `MdLink` — 招待（すでに使用中）
- `MdLogout` — サインアウト
- `MdExpandMore` — グループ名右の chevron

### GroupSwitcher への影響

`GroupSwitcher` のトリガーボタン（現在 `opacity-80` の白テキスト）のクラスを上記共通スタイルに変更する。ドロップダウン部分（白背景カード）は変更しない。

## 変更ファイル

- `frontend/src/app/stock-items/StockItemsClient.tsx` — 招待・サインアウトのスタイル変更
- `frontend/src/components/GroupSwitcher.tsx` — トリガーボタンのスタイル変更

## テスト方針

既存の GroupSwitcher テストはトリガーのクラス変更に伴い更新が必要な場合がある。機能変化はないため Unit テストの修正のみで対応する。E2E は不要。
