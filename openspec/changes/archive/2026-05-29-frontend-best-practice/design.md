## Context

`StockItemsClient.tsx` は現在 373 行の God Component。state（7変数）・CRUD ハンドラ（8関数）・JSX（180行超）が一体化している。テストは `StockItemsClient.test.tsx` でカバーされているが、フックと JSX 層が混在しているためロジックのみの単体テストが書けない。

既存のコンポーネント構成:
- `BaseModal` — モーダルの基底コンポーネント（ConfirmDialog の土台として利用可能）
- `EditItemModal` / `CreateItemModal` など — BaseModal を利用したモーダル群
- `useStockItemsRealtime` — Realtime 購読フック（分離済み、参考実装）

## Goals / Non-Goals

**Goals:**
- `useStockItems` フックへのロジック分離で StockItemsClient を ~150 行以下に削減
- 全 CRUD ハンドラで try/catch を追加し、エラーを `error` state に反映
- `window.confirm` を `ConfirmDialog` に置き換えて UI 一貫性を確保
- 既存テストカバレッジを維持・改善（hook テスト + JSX テスト）

**Non-Goals:**
- optimistic update の導入（別変更として別途検討）
- SWR / React Query への移行
- API の変更や新機能の追加
- エラー UI のデザイン変更（既存の `error` 表示箇所をそのまま使う）

## Decisions

### D1: useStockItems フックの API 設計

```ts
// useStockItems.ts
type UseStockItemsReturn = {
  items: StockItem[];
  loading: boolean;
  error: string | null;
  isModalOpen: boolean;
  urlModalOpen: boolean;
  prefill: { name: string; imageUrl: string | null; sourceUrl: string | null };
  editingItem: StockItem | null;
  imageEditingItem: StockItem | null;
  confirmDeleteItem: StockItem | null;  // window.confirm 置き換え用
  handleCreate: (...) => Promise<void>;
  handleSave: (...) => Promise<void>;
  handleToggleWantToBuy: (item: StockItem) => Promise<void>;
  handleDelete: (item: StockItem) => void;           // confirm ダイアログを開く
  handleConfirmDelete: () => Promise<void>;          // 実際の削除実行
  handleOpenEdit: (item: StockItem) => void;
  handleCloseEdit: () => void;
  handleOpenImageEdit: (item: StockItem) => void;
  handleImageSelect: (imageUrl: string | null) => Promise<void>;
  handleRenameGroup: (groupId: string, name: string) => Promise<void>;
  handleCreateNewGroup: (name: string) => Promise<void>;
  handleExtracted: (name: string, imageUrl: string | null, sourceUrl: string) => void;
  setIsModalOpen: (open: boolean) => void;
  setUrlModalOpen: (open: boolean) => void;
};
```

**理由:** StockItemsClient の JSX 側は props drilling なしにフックの戻り値を直接使えるため、リファクタリングの差分を最小化できる。

### D2: window.confirm の置き換え方法

`window.confirm` を削除し、`confirmDeleteItem: StockItem | null` state を追加。

- `handleDelete(item)` → `confirmDeleteItem` に item をセット（ダイアログを開く）
- `handleConfirmDelete()` → 実際に DELETE API を呼ぶ
- `ConfirmDialog` コンポーネント（新規）— `isOpen`, `message`, `onConfirm`, `onCancel` props

**BaseModal を使う理由:** 既存の modal UX（framer-motion アニメーション、backdrop）と一貫させるため。

### D3: エラーハンドリングのスコープ

全 CRUD ハンドラに `try/catch` を追加し、`setError(err instanceof Error ? err.message : "操作に失敗しました")` をセット。

- フェッチ系エラー（fetchStockItems 内）は既存の `catch` で処理済み → 変更なし
- mutation 後の再取得（`fetchStockItems`）が失敗した場合もエラー表示

**代替案（却下）:** toast notification — 別コンポーネントが必要になり、スコープ過大。既存の inline error 表示で十分。

### D4: テスト戦略

- `useStockItems.test.ts` を新規作成（Vitest、RTL の `renderHook`）— フックのロジックをテスト
- 既存 `StockItemsClient.test.tsx` は JSX 描画・インタラクションのみに絞る（フックは mock）
- `ConfirmDialog.test.tsx` を新規作成（BaseModal ベースのコンポーネントテスト）

## Risks / Trade-offs

- **フック抽出の diff が大きい** → StockItemsClient のロジックをほぼそのまま移動するだけなので、動作変更リスクは低い。既存 E2E テストが回帰チェックを担う。
- **ConfirmDialog の framer-motion アニメーション** → BaseModal を使えば既存の exit animation が適用され、E2E の `not.toBeAttached()` 待機パターンが必要になる。tasks.md に明記する。
- **error state のリセット** → 成功時に `setError(null)` を確実に呼ぶ必要がある。フック内で統一管理することで漏れを防ぐ。
