# Header Modern Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヘッダー右側のグループ切り替え・招待リンク・サインアウトボタンを、統一感のあるアイコンボタンスタイルに変更する。

**Architecture:** `GroupSwitcher.tsx` のトリガーボタンと `StockItemsClient.tsx` のヘッダー要素のみを修正する。機能変更なし、スタイルのみ。既存テストはクラス名に依存していないため変更不要。

**Tech Stack:** Next.js (TypeScript), Tailwind CSS v4, react-icons v5

---

## File Map

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/GroupSwitcher.tsx` | トリガーボタンのクラスを新スタイルに変更 |
| `frontend/src/app/stock-items/StockItemsClient.tsx` | 招待リンクとサインアウトボタンのスタイルを変更 |

テストファイルへの変更は不要（テストはクラス名に依存していない）。

---

## 共通ボタンスタイル（参照）

```
bg-black/20 hover:bg-black/30 transition-colors rounded-lg
h-8 flex items-center gap-1.5 px-2.5 text-sm cursor-pointer border-0 text-white
```

アイコンのみボタン（サインアウト）は `px-2.5` の代わりに `w-8 justify-center px-0`。

---

## Task 1: GroupSwitcher のトリガーボタンを更新

**Files:**
- Modify: `frontend/src/components/GroupSwitcher.tsx`

### 背景

現在のトリガーボタン（`GroupSwitcher.tsx:75-82`）は `opacity-80 hover:opacity-100` のシンプルな白テキスト。これを `MdGroup` アイコン + グループ名 + `MdExpandMore` アイコンの角丸ボックスに変更する。

- [ ] **Step 1: ブランチを作成する**

```bash
gh issue create --title "モダンなヘッダーデザイン" --body "グループ・招待・サインアウトのスタイルをアイコンボタンに変更する。設計: docs/superpowers/specs/2026-05-24-header-modern-design.md"
# 出力されたIssue番号を使ってブランチを作成（例: Issue #130 なら）
git checkout -b 130-header-modern-design
```

- [ ] **Step 2: 既存テストがパスすることを確認する（ベースライン）**

```bash
cd frontend && npx vitest run src/components/GroupSwitcher.test.tsx
```

Expected: 6 tests pass。

- [ ] **Step 3: GroupSwitcher.tsx のトリガーボタンを更新する**

`frontend/src/components/GroupSwitcher.tsx` の先頭 import に追加:

```tsx
import { MdExpandMore, MdGroup } from "react-icons/md";
```

トリガーボタン部分（現在の `return` 内、`<div className="relative" ...>` の直下のボタン）を以下に置き換える:

```tsx
<button
  type="button"
  onClick={() => setOpen((v) => !v)}
  className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-sm text-white cursor-pointer border-0"
>
  <MdGroup aria-hidden size={16} />
  {activeGroup?.name ?? "グループなし"}
  <MdExpandMore aria-hidden size={16} className="opacity-70" />
</button>
```

- [ ] **Step 4: テストを再実行して既存テストがパスすることを確認する**

```bash
cd frontend && npx vitest run src/components/GroupSwitcher.test.tsx
```

Expected: 6 tests pass（スタイル変更のみでテストへの影響なし）。

- [ ] **Step 5: コミットする**

```bash
git add frontend/src/components/GroupSwitcher.tsx
git commit -m "style: modernize GroupSwitcher trigger button with icon"
git push -u origin HEAD
```

---

## Task 2: StockItemsClient のヘッダー要素を更新

**Files:**
- Modify: `frontend/src/app/stock-items/StockItemsClient.tsx`

### 背景

ヘッダー内の招待リンク（`StockItemsClient.tsx:207-213`）とサインアウトボタン（`StockItemsClient.tsx:214-221`）を更新する。招待は `MdLink` + "招待" テキスト、サインアウトは `MdLogout` アイコンのみ。

- [ ] **Step 1: 既存テストがパスすることを確認する（ベースライン）**

```bash
cd frontend && npx vitest run src/app/stock-items/page.test.tsx
```

Expected: すべてのテストがパスすること。

- [ ] **Step 2: StockItemsClient.tsx の import を更新する**

現在:
```tsx
import { MdLink } from "react-icons/md";
```

以下に変更:
```tsx
import { MdLink, MdLogout } from "react-icons/md";
```

- [ ] **Step 3: 招待リンクのスタイルを更新する**

現在（`StockItemsClient.tsx:207-213` あたり）:
```tsx
{group?.role === "owner" && (
  <a
    href="/invite"
    className="opacity-80 hover:opacity-100 underline"
  >
    招待
  </a>
)}
```

以下に変更:
```tsx
{group?.role === "owner" && (
  <a
    href="/invite"
    className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-sm text-white no-underline"
  >
    <MdLink aria-hidden size={16} />
    招待
  </a>
)}
```

- [ ] **Step 4: サインアウトボタンのスタイルを更新する**

現在（`StockItemsClient.tsx:214-221` あたり）:
```tsx
<button
  type="button"
  onClick={() => signOut()}
  className="opacity-80 hover:opacity-100"
>
  サインアウト
</button>
```

以下に変更:
```tsx
<button
  type="button"
  onClick={() => signOut()}
  title="サインアウト"
  className="flex items-center justify-center w-8 h-8 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-white border-0 cursor-pointer"
>
  <MdLogout aria-hidden size={18} />
</button>
```

- [ ] **Step 5: テストを再実行して既存テストがパスすることを確認する**

```bash
cd frontend && npx vitest run src/app/stock-items/page.test.tsx
```

Expected: すべてのテストがパスすること。

- [ ] **Step 6: ローカルで動作確認する**

```bash
cd frontend && npm run dev
```

ブラウザで `http://localhost:3000/stock-items` を開き、以下を確認する:
- グループ切り替えボタンがアイコン+名前+chevron の角丸ボックスで表示される
- 招待リンク（オーナーのみ）がアイコン+"招待" の角丸ボックスで表示される
- サインアウトがアイコンのみの正方形ボタンで表示される
- ホバー時にボタンが少し濃くなる
- サインアウトボタンにカーソルを当てると title ツールチップが出る

- [ ] **Step 7: コミットしてプッシュする**

```bash
git add frontend/src/app/stock-items/StockItemsClient.tsx
git commit -m "style: modernize header invite link and sign-out button"
git push
```

---

## Task 3: PR を作成して CI を確認する

- [ ] **Step 1: PR を作成する**

```bash
gh pr create \
  --title "style: modernize header group/invite/signout buttons" \
  --body "$(cat <<'EOF'
## Summary
- グループ切り替えトリガーを MdGroup アイコン + グループ名 + chevron の角丸ボックスに変更
- 招待リンクを MdLink アイコン + "招待" テキストの角丸ボックスに変更（オーナーのみ）
- サインアウトを MdLogout アイコンのみの正方形ボタンに変更

機能変更なし。スタイルのみ。

Closes #ISSUE番号
EOF
)"
```

- [ ] **Step 2: CI を確認する**

```bash
gh pr checks --watch
```

Expected: すべてのチェックがパスすること。失敗があれば原因を調査して修正する。
