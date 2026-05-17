# フィルターアニメーション 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** フィルター条件変更・商品追加・削除時に Framer Motion でアイテムのフェード+スライド+FLIP アニメーションを付ける。

**Architecture:** `stock-items/page.tsx` のグリッド部分のみ変更。外側の `motion.div layout` がグリッド全体の FLIP を、内側の `motion.div` が各アイテムの enter/exit アニメーションを担当。既存コンポーネント（ItemCard・FilterBar 等）は変更なし。

**Tech Stack:** framer-motion (v12 系)、Vitest + RTL（テスト）

---

## ファイル構成

| 操作 | ファイル |
|------|---------|
| 新規作成 | `frontend/__mocks__/framer-motion.tsx` |
| 変更 | `frontend/src/app/stock-items/page.tsx` |
| 変更 | `frontend/src/app/stock-items/page.test.tsx` |

---

## Task 1: framer-motion インストールとモック設定

**Files:**
- Create: `frontend/__mocks__/framer-motion.tsx`
- Modify: `frontend/src/app/stock-items/page.test.tsx`

- [ ] **Step 1: framer-motion をインストールする**

```bash
cd frontend && npm install framer-motion
```

Expected: `package.json` の `dependencies` に `"framer-motion": "^11.x.x"` が追加される。

- [ ] **Step 2: Vitest 用の手動モックを作成する**

`frontend/__mocks__/framer-motion.tsx` を新規作成:

```tsx
import type React from "react";

type MotionProps = React.HTMLAttributes<HTMLDivElement> & {
  layout?: boolean | string;
  initial?: Record<string, unknown>;
  animate?: Record<string, unknown>;
  exit?: Record<string, unknown>;
  transition?: Record<string, unknown>;
};

export const motion = {
  div: ({
    children,
    layout,
    initial,
    animate,
    exit,
    transition,
    ...props
  }: MotionProps) => <div {...props}>{children}</div>,
};

export const AnimatePresence = ({
  children,
}: {
  children: React.ReactNode;
}) => <>{children}</>;
```

- [ ] **Step 3: page.test.tsx に vi.mock を追加する**

`frontend/src/app/stock-items/page.test.tsx` の既存の `vi.mock` 行の直後に1行追加する:

```tsx
vi.mock("@/lib/api");
vi.mock("@/lib/useStockItemsRealtime");
vi.mock("framer-motion");  // ← 追加
```

- [ ] **Step 4: 既存テストが通ることを確認する**

```bash
cd frontend && npx vitest run src/app/stock-items/page.test.tsx
```

Expected:
```
✓ src/app/stock-items/page.test.tsx (16 tests)
Test Files  1 passed (1)
Tests       16 passed (16)
```

（この時点では page.tsx は未変更のため framer-motion は import されておらず、モックは起動しないが、テストは全件通る）

- [ ] **Step 5: Biome チェックを通す**

```bash
cd frontend && npx biome check __mocks__/framer-motion.tsx
```

Expected: `Checked 1 file(s). No fixes needed.`（警告・エラーなし）

- [ ] **Step 6: コミット**

```bash
cd frontend && git add __mocks__/framer-motion.tsx src/app/stock-items/page.test.tsx package.json package-lock.json
git commit -m "Add framer-motion and test mock for filter animation"
```

---

## Task 2: page.tsx にアニメーションを実装する

**Files:**
- Modify: `frontend/src/app/stock-items/page.tsx:1` (import 追加)
- Modify: `frontend/src/app/stock-items/page.tsx:178-193` (グリッド部分書き換え)

- [ ] **Step 1: framer-motion を import する**

`frontend/src/app/stock-items/page.tsx` の先頭 import 群に追加する。既存の import は変えず、以下を追加:

```tsx
import { AnimatePresence, motion } from "framer-motion";
```

追加後のファイル冒頭（行順は Biome の import 整理に従う）:

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import CreateItemModal from "@/components/CreateItemModal";
import EditItemModal from "@/components/EditItemModal";
import FilterBar from "@/components/FilterBar";
import ImageSelectionModal from "@/components/ImageSelectionModal";
import ItemCard from "@/components/ItemCard";
import ItemCardSimple from "@/components/ItemCardSimple";
import {
  createStockItem,
  deleteStockItem,
  fetchStockItems,
  updateStockItem,
} from "@/lib/api";
import { type FilterCondition, filterStockItems } from "@/lib/filterStockItems";
import { useStockItemsRealtime } from "@/lib/useStockItemsRealtime";
import type { StockItem } from "@/types/stockItem";
```

- [ ] **Step 2: グリッド部分を motion.div + AnimatePresence で書き換える**

`frontend/src/app/stock-items/page.tsx` の以下の部分を置換する。

**変更前（約 178〜193 行目）:**

```tsx
<div
  className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 ${viewMode === "simple" ? "gap-1.5" : "gap-3"}`}
>
  {filteredItems.map((item) => (
    <Card
      key={item.id}
      item={item}
      onDelete={handleDelete}
      onEdit={handleOpenEdit}
      onToggleWantToBuy={handleToggleWantToBuy}
      onImageEdit={handleOpenImageEdit}
    />
  ))}
</div>
```

**変更後:**

```tsx
<motion.div
  layout
  className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 ${viewMode === "simple" ? "gap-1.5" : "gap-3"}`}
>
  <AnimatePresence>
    {filteredItems.map((item) => (
      <motion.div
        key={item.id}
        layout
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.5 }}
      >
        <Card
          item={item}
          onDelete={handleDelete}
          onEdit={handleOpenEdit}
          onToggleWantToBuy={handleToggleWantToBuy}
          onImageEdit={handleOpenImageEdit}
        />
      </motion.div>
    ))}
  </AnimatePresence>
</motion.div>
```

- [ ] **Step 3: テストを実行して全件通ることを確認する**

```bash
cd frontend && npx vitest run src/app/stock-items/page.test.tsx
```

Expected:
```
✓ src/app/stock-items/page.test.tsx (16 tests)
Test Files  1 passed (1)
Tests       16 passed (16)
```

モックが `motion.div` を通常の `<div>` に置き換えるため、既存テストは変更なしで通る。

- [ ] **Step 4: Biome チェックを通す**

```bash
cd frontend && npx biome check src/app/stock-items/page.tsx
```

Expected: `Checked 1 file(s). No fixes needed.`

- [ ] **Step 5: ブラウザで動作確認する**

```bash
cd frontend && npm run dev
```

`http://localhost:3000/stock-items` を開いて以下を確認する:

| 操作 | 期待する動き |
|------|-------------|
| 検索ボックスに文字を入力 | 非該当アイテムが上にスライドしながらフェードアウト、残ったアイテムがスムーズに詰まる |
| 検索をクリア | アイテムが上からスライドしながらフェードイン、FLIP で位置移動 |
| 「買いたいものだけ」ON/OFF | 同上 |
| 商品追加 | 新アイテムが上からスライドしながらフェードイン |
| 商品削除 | 削除アイテムが上にスライドしながらフェードアウト |

- [ ] **Step 6: コミット**

```bash
cd frontend && git add src/app/stock-items/page.tsx
git commit -m "Add filter animation with Framer Motion"
```
