# UI Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヘッダー・フィルターバー・商品カードを、モダン化済みモーダルのデザイン言語（rounded-xl/2xl・slate カラー・border-2）に統一する。

**Architecture:** CSS クラスのみの変更。ロジック・状態管理・API は一切触らない。6 コンポーネントを独立したタスクで順番に変更し、各タスクで `npm run test` を通過させてからコミットする。

**Tech Stack:** Next.js (TypeScript), Tailwind CSS, Vitest + React Testing Library

---

## ファイルマップ

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/GroupSwitcher.tsx` | トリガーボタンの色（`bg-black/20 text-white` → `bg-slate-100 text-slate-600`） |
| `frontend/src/app/stock-items/StockItemsClient.tsx` | ヘッダー背景・ロゴ・ボタン色、追加ボタンの `rounded` → `rounded-xl` |
| `frontend/src/components/FilterBar.tsx` | インプット・セレクト・ボタン・トグルの角丸とボーダースタイル |
| `frontend/src/components/ItemCard.tsx` | カード外枠・サムネイル・バッジ・アクションボタン全体 |
| `frontend/src/components/ItemCardSimple.tsx` | カード外枠・サムネイル・バッジ・カートボタン |

---

## Task 1: GroupSwitcher — トリガーボタンのスタイル変更

**Files:**
- Modify: `frontend/src/components/GroupSwitcher.tsx:79`
- Test: `frontend/src/components/GroupSwitcher.test.tsx`（既存テストで確認）

- [ ] **Step 1: ベースラインを確認する**

```bash
cd frontend && npx vitest run src/components/GroupSwitcher.test.tsx
```

Expected: すべて PASS

- [ ] **Step 2: トリガーボタンのクラスを変更する**

`frontend/src/components/GroupSwitcher.tsx` の 79 行目を変更：

```tsx
// Before
className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-sm text-white cursor-pointer border-0"

// After
className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-sm text-slate-600 cursor-pointer border-0"
```

- [ ] **Step 3: テストを実行して確認する**

```bash
cd frontend && npx vitest run src/components/GroupSwitcher.test.tsx
```

Expected: すべて PASS

- [ ] **Step 4: コミット**

```bash
git add frontend/src/components/GroupSwitcher.tsx
git commit -m "Style: update GroupSwitcher trigger button for white header"
```

---

## Task 2: ヘッダー — 白背景＋ロゴアイコン＋ボタン色変更

**Files:**
- Modify: `frontend/src/app/stock-items/StockItemsClient.tsx`

- [ ] **Step 1: ベースラインを確認する**

```bash
cd frontend && npx vitest run src/app/stock-items/
```

Expected: すべて PASS

- [ ] **Step 2: ページ背景とヘッダー背景を変更する**

`StockItemsClient.tsx` で以下の 2 箇所を変更する：

```tsx
// Before
<div className="min-h-screen bg-gray-50">
// After
<div className="min-h-screen bg-slate-50">
```

```tsx
// Before
<header className="bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb] text-white py-2 px-4">
// After
<header className="bg-white border-b border-slate-100 py-2 px-4">
```

- [ ] **Step 3: h1 をロゴアイコン＋テキストに変更する**

```tsx
// Before
<h1 className="text-2xl font-bold">Pantry Panel</h1>

// After
<div className="flex items-center gap-2.5">
  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d1b2] to-[#0d9488] flex items-center justify-center shrink-0">
    <span className="text-white text-sm font-bold select-none">P</span>
  </div>
  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Pantry Panel</h1>
</div>
```

- [ ] **Step 4: 招待リンクボタンのスタイルを変更する**

```tsx
// Before
className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-sm text-white no-underline"
// After
className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-sm text-slate-500 no-underline"
```

- [ ] **Step 5: サインアウトボタンのスタイルを変更する**

```tsx
// Before
className="flex items-center justify-center w-8 h-8 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-white border-0 cursor-pointer"
// After
className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500 border-0 cursor-pointer"
```

- [ ] **Step 6: テストを実行して確認する**

```bash
cd frontend && npx vitest run src/app/stock-items/
```

Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
git add frontend/src/app/stock-items/StockItemsClient.tsx
git commit -m "Style: modernize header — white bg, teal logo icon, slate buttons"
```

---

## Task 3: FilterBar — インプット・セレクト・ボタン・トグルのスタイル統一

**Files:**
- Modify: `frontend/src/components/FilterBar.tsx`
- Test: `frontend/src/components/FilterBar.test.tsx`（既存テストで確認）

- [ ] **Step 1: ベースラインを確認する**

```bash
cd frontend && npx vitest run src/components/FilterBar.test.tsx
```

Expected: すべて PASS

- [ ] **Step 2: 検索インプットのスタイルを変更する**

`FilterBar.tsx` の検索 `<input>` のクラスを変更（46-53 行目付近）：

```tsx
// Before
className="w-full border border-gray-300 rounded px-3 py-2 pr-10 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] [&::-webkit-search-cancel-button]:appearance-none"

// After
className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 pr-10 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#00d1b2] transition-colors [&::-webkit-search-cancel-button]:appearance-none"
```

- [ ] **Step 3: 買いたいフィルターボタンのスタイルを変更する**

`FilterBar.tsx` の `toggleWantToBuyOnly` ボタンのクラスを変更（67-79 行目付近）：

```tsx
// Before (active)
"w-full inline-flex items-center justify-center rounded bg-blue-500 hover:bg-blue-600 px-3 py-2 text-white"
// Before (inactive)
"w-full inline-flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 px-3 py-2 text-gray-500"

// After (active)
"w-full inline-flex items-center justify-center rounded-xl bg-blue-500 hover:bg-blue-600 px-3 py-2 text-white"
// After (inactive)
"w-full inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-slate-400"
```

- [ ] **Step 4: カテゴリセレクトのスタイルを変更する**

`FilterBar.tsx` の `<select>` のクラスを変更（80-85 行目付近）：

```tsx
// Before
className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"

// After
className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-[#00d1b2] transition-colors bg-white"
```

- [ ] **Step 5: 表示モード切替トグルのスタイルを変更する**

`FilterBar.tsx` のトグルコンテナと内部インジケーターのクラスを変更（101-124 行目付近）：

```tsx
// 外側コンテナ Before
className="relative inline-flex items-center rounded-full bg-gray-200 p-1"
// After
className="relative inline-flex items-center rounded-xl bg-slate-100 p-1"

// スライドインジケーター Before
className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-[#00d1b2] transition-transform duration-200 ease-out ${...}`}
// After
className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-[#00d1b2] transition-transform duration-200 ease-out ${...}`}
```

- [ ] **Step 6: テストを実行して確認する**

```bash
cd frontend && npx vitest run src/components/FilterBar.test.tsx
```

Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
git add frontend/src/components/FilterBar.tsx
git commit -m "Style: modernize FilterBar — rounded-xl, border-2 border-slate-200"
```

---

## Task 4: 追加ボタン — rounded-xl に統一

**Files:**
- Modify: `frontend/src/app/stock-items/StockItemsClient.tsx:243-258`（Task 2 と同じファイル）

- [ ] **Step 1: 「商品を追加」ボタンと URL ボタンのクラスを変更する**

`StockItemsClient.tsx` の追加ボタン 2 つを変更：

```tsx
// 「商品を追加」ボタン Before
className="flex-1 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium md:flex-none"
// After
className="flex-1 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded-xl font-bold md:flex-none"

// URLから追加ボタン Before
className="shrink-0 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-3 py-2.5 rounded font-medium"
// After
className="shrink-0 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-3 py-2.5 rounded-xl font-bold"
```

- [ ] **Step 2: テストを実行して確認する**

```bash
cd frontend && npx vitest run src/app/stock-items/
```

Expected: すべて PASS

- [ ] **Step 3: コミット**

```bash
git add frontend/src/app/stock-items/StockItemsClient.tsx
git commit -m "Style: update add buttons to rounded-xl"
```

---

## Task 5: ItemCard — カード・バッジ・アクションボタン全体

**Files:**
- Modify: `frontend/src/components/ItemCard.tsx`
- Test: `frontend/src/components/ItemCard.test.tsx`（既存テストで確認）

重要: `wantToBuy=true` のとき `text-blue-500` クラスが付くことを確認するテストが存在する（`ItemCard.test.tsx` 219 行目）。このクラスは変更しないこと。

- [ ] **Step 1: ベースラインを確認する**

```bash
cd frontend && npx vitest run src/components/ItemCard.test.tsx
```

Expected: すべて PASS

- [ ] **Step 2: カード外枠を wantToBuy 対応に変更する**

`ItemCard.tsx` の `<article>` の `className` を変更：

```tsx
// Before
className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow-md"

// After
className={`flex items-center gap-3 rounded-2xl border-2 bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow-md ${item.wantToBuy ? "border-blue-200 bg-blue-50/30" : "border-slate-100"}`}
```

- [ ] **Step 3: サムネイルボタンのスタイルを変更する**

```tsx
// Before
className="shrink-0 w-16 h-16 rounded overflow-hidden bg-gray-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"

// After
className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border-2 border-slate-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
```

- [ ] **Step 4: カテゴリバッジのスタイルを変更する**

```tsx
// Before
className="inline-block bg-[#ebfffc] text-[#00947e] text-xs px-2 py-0.5 rounded-full mb-1"

// After
className="inline-block bg-teal-50 text-teal-700 text-xs px-2 py-0.5 rounded-full mb-1"
```

- [ ] **Step 5: 外部リンクのスタイルを変更する**

```tsx
// Before
className="w-11 h-8 rounded bg-transparent p-0 text-gray-400 hover:text-gray-600 inline-flex items-center justify-center"

// After
className="w-9 h-9 rounded-xl bg-transparent p-0 text-slate-300 hover:text-slate-500 inline-flex items-center justify-center"
```

- [ ] **Step 6: want to buy トグルボタンのスタイルを変更する**

`text-blue-500` / `text-gray-300` は維持すること。

```tsx
// Before (wantToBuy=true)
"w-11 h-8 rounded bg-transparent p-0 text-blue-500 hover:text-blue-600 inline-flex items-center justify-center"
// Before (wantToBuy=false)
"w-11 h-8 rounded bg-transparent p-0 text-gray-300 hover:text-gray-400 inline-flex items-center justify-center"

// After (wantToBuy=true) — text-blue-500 は必ず維持
"w-9 h-9 rounded-xl bg-transparent p-0 text-blue-500 hover:text-blue-600 inline-flex items-center justify-center"
// After (wantToBuy=false)
"w-9 h-9 rounded-xl bg-transparent p-0 text-gray-300 hover:text-gray-400 inline-flex items-center justify-center"
```

- [ ] **Step 7: 削除ボタンのスタイルを変更する（ソフトレッド）**

```tsx
// Before
className="w-11 h-8 rounded bg-[#ff3860] hover:bg-[#ff2b56] p-0 text-white inline-flex items-center justify-center disabled:bg-gray-300 disabled:cursor-not-allowed"

// After
className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 p-0 text-red-300 inline-flex items-center justify-center disabled:bg-slate-100 disabled:text-slate-200 disabled:cursor-not-allowed"
```

- [ ] **Step 8: テストを実行して確認する**

```bash
cd frontend && npx vitest run src/components/ItemCard.test.tsx
```

Expected: すべて PASS。特に以下を確認する：
- `"wantToBuy=true のとき、カートアイコンボタンに text-blue-500 クラスが付く"` → PASS
- `"wantToBuy=true のとき削除ボタンが disabled になる"` → PASS

- [ ] **Step 9: コミット**

```bash
git add frontend/src/components/ItemCard.tsx
git commit -m "Style: modernize ItemCard — rounded-2xl, soft-red delete, wantToBuy highlight"
```

---

## Task 6: ItemCardSimple — カード外枠・サムネイル・バッジ

**Files:**
- Modify: `frontend/src/components/ItemCardSimple.tsx`
- Test: `frontend/src/components/ItemCardSimple.test.tsx`（既存テストで確認）

- [ ] **Step 1: ベースラインを確認する**

```bash
cd frontend && npx vitest run src/components/ItemCardSimple.test.tsx
```

Expected: すべて PASS

- [ ] **Step 2: カード外枠を変更する**

```tsx
// Before
className="flex items-center gap-3 rounded-lg border bg-white px-4 py-2 shadow-sm transition-shadow hover:shadow-md"

// After
className="flex items-center gap-3 rounded-2xl border-2 border-slate-100 bg-white px-4 py-2 shadow-sm transition-shadow hover:shadow-md"
```

- [ ] **Step 3: サムネイルボタンのスタイルを変更する**

```tsx
// Before
className="shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"

// After
className="shrink-0 w-8 h-8 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
```

- [ ] **Step 4: カテゴリバッジのスタイルを変更する**

```tsx
// Before
className="shrink-0 w-16 text-center bg-[#ebfffc] text-[#00947e] text-xs px-2 py-0.5 rounded-full truncate"

// After
className="shrink-0 w-16 text-center bg-teal-50 text-teal-700 text-xs px-2 py-0.5 rounded-full truncate"
```

- [ ] **Step 5: カートトグルボタンのスタイルを変更する**

```tsx
// Before (wantToBuy=true)
"w-11 h-7 rounded bg-transparent p-0 text-blue-500 hover:text-blue-600 inline-flex items-center justify-center"
// Before (wantToBuy=false)
"w-11 h-7 rounded bg-transparent p-0 text-gray-300 hover:text-gray-400 inline-flex items-center justify-center"

// After (wantToBuy=true)
"w-9 h-8 rounded-xl bg-transparent p-0 text-blue-500 hover:text-blue-600 inline-flex items-center justify-center"
// After (wantToBuy=false)
"w-9 h-8 rounded-xl bg-transparent p-0 text-gray-300 hover:text-gray-400 inline-flex items-center justify-center"
```

- [ ] **Step 6: テストを実行して確認する**

```bash
cd frontend && npx vitest run src/components/ItemCardSimple.test.tsx
```

Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
git add frontend/src/components/ItemCardSimple.tsx
git commit -m "Style: modernize ItemCardSimple — rounded-2xl, teal badge, slate thumbnail"
```

---

## Task 7: 全体確認・E2E・push

- [ ] **Step 1: 全 Vitest を実行する**

```bash
cd frontend && npm run test
```

Expected: すべて PASS

- [ ] **Step 2: dev server を起動する**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: E2E を実行する（dev server 起動状態で）**

別ターミナルで実行：

```bash
cd frontend && npx playwright test --project=mock
```

Expected: すべて PASS。失敗した場合はエラーメッセージを確認し、スタイル変更によるセレクタの破損がないかチェックする。

- [ ] **Step 4: ブラウザで目視確認する**

`http://localhost:3000/stock-items` を開いて以下を確認する：
- ヘッダーが白背景＋ teal ロゴアイコンになっている
- FilterBar の入力・セレクトが角丸になっている
- ItemCard が rounded-2xl で wantToBuy=true のカードが青ハイライトされる
- 削除ボタンがソフトレッドになっている
- 「商品を追加」ボタンが rounded-xl になっている

- [ ] **Step 5: push して CI を確認する**

```bash
git push -u origin 148-ui-modernization
gh pr create --title "UI modernization: header, item list, filter bar" --body "$(cat <<'EOF'
## Summary
- Modernize header: white bg + teal logo icon, slate buttons
- Modernize FilterBar: rounded-xl, border-2 border-slate-200
- Modernize ItemCard/ItemCardSimple: rounded-2xl, soft-red delete, wantToBuy highlight
- Update GroupSwitcher trigger button for white header context
- Update add buttons to rounded-xl

Closes #148
EOF
)"
gh pr checks --watch
```

Expected: すべての CI チェックが PASS
