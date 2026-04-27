## Context

Phase 1 で `wantToBuy` フィールドは `StockItem` 型と DB に存在するが、UI からトグルする手段は無い。バックエンドの `PATCH /api/stock-items/:id` は wantToBuy を含むすべてのフィールドを optional で受け取り、更新時 `updated_at = now()` を発行する。Phase 2 D (編集) で `updateStockItem(id, params)` の API クライアントが整っているため、トグルはこれを再利用するだけで実現できる。

ItemCard は phase2-edit-item で `<article>` + 兄弟 `<button>` (編集 / 削除) 構造に変更済み。toggle ボタンも同じ並びに足せばクリック動線の競合 (編集モーダル誤発火) は起きない。

## Goals / Non-Goals

**Goals:**
- 商品カード上のトグルボタンで wantToBuy を切替できる
- トグル成功時に `updated_at` が更新され、カードが一覧の先頭に並ぶ
- wantToBuy=true / false の状態が視覚的に区別できる
- 既存の編集・削除動線と干渉しない (誤クリックがない)

**Non-Goals:**
- wantToBuy=true のアイテムだけを表示するフィルタ UI (Phase 2 F で扱う)
- 「買いたい」アイテムの専用ビュー / 別ページ
- 追加・消費 (旧プロダクトの [+追加] [-消費]) のストック数操作 (本プロジェクトでは在庫数管理を簡略化)
- toggle 操作の楽観的更新 (optimistic UI) — 当面は API 完了後に再取得する素朴な実装

## Decisions

### Decision 1: トグルボタンは ItemCard 内の独立した `<button>` (編集ボタンと兄弟)

`<article>` 直下に編集 button、トグル button、削除 button を flex で並べる。トグルボタンが編集ボタンに含まれていると編集モーダルが誤発火するため、独立した兄弟構造にする。

```tsx
<article aria-label={item.name}>
  <button onClick={() => onEdit(item)}>{/* category + name */}</button>
  <button onClick={() => onToggleWantToBuy(item)} aria-label="買いたい">🛒</button>
  <button onClick={() => onDelete(item.id)} disabled={item.wantToBuy}>削除</button>
</article>
```

削除ボタンは常時描画し、wantToBuy=true で `disabled` にする (非表示にすると wantToBuy トグル後にボタン位置がジャンプして UX が悪い)。

**Alternatives considered:**
- 編集ボタンの中にトグルアイコンを入れ、`stopPropagation` で誤発火を防ぐ — phase2-edit-item で兄弟構造を採用した経緯と一貫性がない
- 削除ボタンの位置に動的に表示 (wantToBuy=false で削除、true でトグル) — どちらの状態でも常時操作可能にしたいので不可

**Rationale:** phase2-edit-item で確立した「カード = `<article>` + 兄弟 button 群」のパターンを踏襲。`stopPropagation` を使わずに誤発火を防げる。

### Decision 2: トグルアイコンは Tailwind + 絵文字 (🛒) で実装

ライブラリ追加 (Heroicons 等) は避け、UTF-8 絵文字 🛒 をボタン内に置く。状態ごとにスタイルを変える:

- **wantToBuy=true** (買いたい): `bg-[#00d1b2]` の塗りつぶし、白文字。アクティブな状態を明示
- **wantToBuy=false** (在庫あり): `bg-gray-200 text-gray-500`。控えめに表示

`aria-pressed` 属性で支援技術にも状態を伝える。

**Alternatives considered:**
- Heroicons の ShoppingCart (outline / solid 切替) — 依存追加とビジュアルの一貫性管理が必要
- カスタム SVG — 過剰
- テキストラベル (「買いたい」「在庫あり」) — カード上では場所を取りすぎる

**Rationale:** 旧プロダクトと同じ 🛒 絵文字、Tailwind の塗り変えだけで状態表現でき、依存ゼロ。後で Heroicons 等に差し替えるのも容易。

### Decision 3: トグル後の更新は再取得 (refetch)

`onToggleWantToBuy(item)` ハンドラは:
1. `updateStockItem(item.id, { wantToBuy: !item.wantToBuy })` を呼ぶ
2. 成功したら `fetchStockItems()` を再実行して一覧を更新

成功時は `updated_at` が更新されるためカードは先頭に来る (バックエンド側の `ORDER BY updated_at DESC`)。

**Alternatives considered:**
- 楽観的更新 (state を即座に変更し、API 失敗時にロールバック) — UX は良いがエラーハンドリングが煩雑
- WebSocket / Realtime push — Phase 3 以降のスコープ

**Rationale:** 既存の create / delete / edit と同じ「API 完了 → re-fetch」パターン。Phase 3 のリアルタイム化で全機能を一括で楽観的更新に切替える方が筋が通る。

### Decision 4: テスト戦略

- **ItemCard.test.tsx** に追加:
  - wantToBuy=false でトグル button が aria-pressed=false で表示される
  - wantToBuy=true でトグル button が aria-pressed=true で表示される
  - トグルボタンクリックで `onToggleWantToBuy(item)` が呼ばれ、`onEdit` は呼ばれない
- **ItemCard.test.tsx** 既存テスト修正:
  - 「wantToBuy=true で削除ボタンが表示されない」は維持 (トグル button は表示される)
  - 編集発火テストの button selector を `name: /商品名/` のままにできるか要確認 (トグル button にも商品名が含まれていなければ問題なし)
- **page.test.tsx** に 1 ケース:
  - トグルクリック → API 呼び出し → 一覧再取得で並び順が変わる
- **E2E**: 本 change では追加しない。Phase 2 全体が落ち着いた後に追記

### Decision 5: API クライアントは既存の `updateStockItem` を流用

新関数 `toggleWantToBuy(id)` は作らない。`updateStockItem(id, { wantToBuy: !current })` で十分かつ意図が明示的。

**Rationale:** 抽象化は 3 箇所目で検討。今は重複が無いので素直に書く。

## Risks / Trade-offs

- **[トグル中の連打で API が複数飛ぶ]** → 当面は許容。バックエンドはべき等 (同じ値を何度送っても結果は同じ)。後続で disabled 中の loading 状態を入れる
- **[wantToBuy=true のカード上で誤って削除を期待される]** → 削除ボタンは常時描画するが wantToBuy=true で `disabled` にする。表示/非表示を切替えるとボタン位置がジャンプして UX が悪いため、有効/無効の切替で対応
- **[並び順の急変によるユーザの混乱]** → トグルで先頭に飛ぶ挙動は旧プロダクト由来の意図的仕様。視覚状態の変化と合わせて「リストに送った」感が出る

## Migration Plan

不要 (UI 機能追加のみ。データモデル / API 互換性の変更なし)。

## Open Questions

- トグル button の aria-label は「買いたい」「買いたいリストに追加」「Toggle want to buy」のいずれが最適か → 実装で確定
- wantToBuy=true のカード全体に視覚インジケータ (左ボーダー teal、背景薄 teal 等) を入れるか → MVP では toggle button だけで状態表現し、必要なら後で追加
