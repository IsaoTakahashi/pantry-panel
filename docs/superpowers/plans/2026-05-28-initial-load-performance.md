# 初回ロードパフォーマンス改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AuthGuard loading 中の白い画面をスケルトン表示に置き換え、モーダルを動的インポートに変えて初回 JS バンドルを削減する

**Architecture:** `StockItemsClient.tsx` 1ファイルのみ変更。全 hook 呼び出しの後に `if (authLoading) return <StockItemsSkeleton />` を追加し、4つのモーダル import を `next/dynamic` に置き換える。

**Tech Stack:** Next.js 16 (next/dynamic), React 19, TypeScript

---

### Task 1: GitHub Issue とブランチを作成する

- [ ] **Step 1: GitHub Issue を作成する**

```bash
gh issue create \
  --title "初回ロード改善: AuthGuard スケルトン表示 + モーダル動的インポート" \
  --body "## 概要
初回アクセス時の白い画面を改善する。

- AuthGuard loading 中に StockItemsSkeleton を表示する
- 4つのモーダルコンポーネントを next/dynamic で遅延ロードする

## 関連
- 設計ドキュメント: docs/superpowers/specs/2026-05-28-initial-load-performance-design.md"
```

作成後、出力される Issue 番号を控える（例: #151）。

- [ ] **Step 2: ブランチを作成する**

Issue 番号を `{N}` に置き換えて実行する:

```bash
git switch -c {N}-initial-load-performance
```

---

### Task 2: StockItemsClient.tsx を変更する

変更対象: `frontend/src/app/stock-items/StockItemsClient.tsx`

- [ ] **Step 1: ファイルの現在の内容を確認する**

```bash
head -30 frontend/src/app/stock-items/StockItemsClient.tsx
```

期待される出力: `"use client"` から始まり、モーダルの静的 import が並んでいること。

- [ ] **Step 2: import セクションを変更する**

ファイル先頭の import ブロックを以下のように変更する。

**変更前（7〜14行目）:**
```tsx
import AuthGuard from "@/components/AuthGuard";
import CreateItemModal from "@/components/CreateItemModal";
import EditItemModal from "@/components/EditItemModal";
import FilterBar from "@/components/FilterBar";
import GroupSwitcher from "@/components/GroupSwitcher";
import ImageSelectionModal from "@/components/ImageSelectionModal";
import ItemCard from "@/components/ItemCard";
import ItemCardSimple from "@/components/ItemCardSimple";
import UrlRegistrationModal from "@/components/UrlRegistrationModal";
```

**変更後:**
```tsx
import dynamic from "next/dynamic";
import AuthGuard from "@/components/AuthGuard";
import FilterBar from "@/components/FilterBar";
import GroupSwitcher from "@/components/GroupSwitcher";
import ItemCard from "@/components/ItemCard";
import ItemCardSimple from "@/components/ItemCardSimple";
import StockItemsSkeleton from "./StockItemsSkeleton";
import { useAuth } from "@/contexts/AuthContext";

const CreateItemModal = dynamic(() => import("@/components/CreateItemModal"));
const EditItemModal = dynamic(() => import("@/components/EditItemModal"));
const ImageSelectionModal = dynamic(
  () => import("@/components/ImageSelectionModal"),
);
const UrlRegistrationModal = dynamic(
  () => import("@/components/UrlRegistrationModal"),
);
```

注意: `import { useAuth } from "@/contexts/AuthContext"` は元々 15 行目にある。移動不要だが `import dynamic` を先頭 `"use client"` の直後に追加すること。Biome の import 順序ルールに従い、`next/dynamic` は `@/` import より前に置く。

実際に行う編集（ファイルの 1〜25 行目を置き換える）:

```tsx
"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MdLink, MdLogout } from "react-icons/md";
import AuthGuard from "@/components/AuthGuard";
import FilterBar from "@/components/FilterBar";
import GroupSwitcher from "@/components/GroupSwitcher";
import ItemCard from "@/components/ItemCard";
import ItemCardSimple from "@/components/ItemCardSimple";
import StockItemsSkeleton from "./StockItemsSkeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  createStockItem,
  deleteStockItem,
  fetchStockItems,
  updateStockItem,
} from "@/lib/api";
import { createGroup, updateGroupName } from "@/lib/authApi";
import { type FilterCondition, filterStockItems } from "@/lib/filterStockItems";
import { useStockItemsRealtime } from "@/lib/useStockItemsRealtime";
import type { StockItem } from "@/types/stockItem";

const CreateItemModal = dynamic(() => import("@/components/CreateItemModal"));
const EditItemModal = dynamic(() => import("@/components/EditItemModal"));
const ImageSelectionModal = dynamic(
  () => import("@/components/ImageSelectionModal"),
);
const UrlRegistrationModal = dynamic(
  () => import("@/components/UrlRegistrationModal"),
);
```

- [ ] **Step 3: authLoading 早期リターンを追加する**

`useEffect` の閉じブレースの直後（`}, [authLoading, accessToken, activeGroupId]);` の次の行）、`return (` の直前に以下を追加する:

**変更前（191〜193行目付近）:**
```tsx
  }, [authLoading, accessToken, activeGroupId]);

  return (
    <AuthGuard>
```

**変更後:**
```tsx
  }, [authLoading, accessToken, activeGroupId]);

  if (authLoading) return <StockItemsSkeleton />;

  return (
    <AuthGuard>
```

注意: React のフックルールにより、この早期リターンはすべての `useState` / `useEffect` / `useCallback` / `useMemo` の呼び出しより後でなければならない。現在の配置（`useEffect` の後）は正しい。

- [ ] **Step 4: Biome lint を通す**

```bash
cd frontend && npx biome check --write src/app/stock-items/StockItemsClient.tsx
```

期待される出力: エラーなし（import の並び順が自動整形される場合あり）。

- [ ] **Step 5: TypeScript 型チェックを通す**

```bash
cd frontend && npx tsc --noEmit
```

期待される出力: エラーなし。

- [ ] **Step 6: 変更内容を確認する**

```bash
git diff frontend/src/app/stock-items/StockItemsClient.tsx
```

確認ポイント:
- `import dynamic from "next/dynamic"` が追加されている
- `import StockItemsSkeleton from "./StockItemsSkeleton"` が追加されている
- `CreateItemModal`, `EditItemModal`, `ImageSelectionModal`, `UrlRegistrationModal` の静的 import が消えている
- `const CreateItemModal = dynamic(...)` 等が追加されている
- `if (authLoading) return <StockItemsSkeleton />;` が `return (<AuthGuard>` の直前にある

- [ ] **Step 7: コミットする**

```bash
git add frontend/src/app/stock-items/StockItemsClient.tsx
git commit -m "perf: show skeleton during auth loading, lazy-load modals"
git push -u origin HEAD
```

---

### Task 3: ローカル E2E テストを実行して既存テストがパスすることを確認する

- [ ] **Step 1: dev サーバーを起動する（バックグラウンド）**

```bash
cd frontend && npm run dev &
```

サーバーが起動するまで数秒待つ。`http://localhost:3000` が準備できたことを確認:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
```

期待: `200`

- [ ] **Step 2: E2E テストを実行する**

```bash
cd frontend && npx playwright test
```

期待される出力: すべてのテストが PASS。失敗がある場合は内容を確認して修正する。

- [ ] **Step 3: dev サーバーを停止する**

```bash
kill %1 2>/dev/null || pkill -f "next dev"
```

---

### Task 4: PR を作成して CI を確認する

- [ ] **Step 1: PR を作成する**

`{N}` を Task 1 で作成した Issue 番号に置き換えて実行:

```bash
gh pr create \
  --title "perf: show skeleton during auth loading, lazy-load modals" \
  --body "$(cat <<'EOF'
## 概要

初回アクセス時の白い画面を改善する2つの変更。

- AuthGuard loading 中（Supabase セッション確認〜グループ取得完了まで）に `StockItemsSkeleton` を表示する
- `CreateItemModal` / `EditItemModal` / `ImageSelectionModal` / `UrlRegistrationModal` を `next/dynamic` で遅延ロードし、初回 JS バンドルから除外する

## 変更ファイル

- `frontend/src/app/stock-items/StockItemsClient.tsx` のみ

Closes #{N}
EOF
)"
```

- [ ] **Step 2: CI の完了を待つ**

```bash
gh pr checks --watch
```

期待: すべての CI ジョブが ✓ PASS。失敗があれば原因を調査して修正コミットを push する。
