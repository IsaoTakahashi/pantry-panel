# フィルターアニメーション設計

## 概要

フィルター条件の変更や商品の追加・削除時に、アイテムの表示切り替えをアニメーションで行う。旧アプリ（Nuxt.js + Vue `<transition-group>`）と同等の体験を Next.js + Framer Motion で再現する。

## 対象

`frontend/src/app/stock-items/page.tsx` のアイテムグリッド部分のみ変更。既存コンポーネント（`ItemCard`、`ItemCardSimple`、`FilterBar` 等）は変更なし。

## アニメーション仕様

| 項目 | 値 |
|------|-----|
| Enter | `opacity: 0→1`, `y: -12px→0`（上からスライドしながらフェードイン） |
| Exit | `opacity: 1→0`, `y: 0→-12px`（上にスライドしながらフェードアウト） |
| 位置移動 (FLIP) | Framer Motion `layout` prop（残ったアイテムがスムーズに詰まる） |
| Duration | 0.5s |
| Easing | Framer Motion デフォルト（easeOut） |
| AnimatePresence mode | `sync`（デフォルト） |

## 実装

### コード変更

`stock-items/page.tsx` のグリッド部分を以下に変更する:

```tsx
import { AnimatePresence, motion } from "framer-motion";

// ...

<motion.div layout className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 ${viewMode === "simple" ? "gap-1.5" : "gap-3"}`}>
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

### 依存パッケージ

`framer-motion` を `frontend/package.json` の `dependencies` に追加する（バンドルサイズ約 +50KB、gzip 後 ~18KB）。

## テスト対応

Vitest + RTL 環境では JSDOM が Web Animations API をサポートしないため、`framer-motion` をモックする。

`frontend/__mocks__/framer-motion.tsx`（`node_modules` と同階層）を新規作成:

```tsx
import type React from "react";

export const motion = {
  div: ({ children, layout, initial, animate, exit, transition, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
};

export const AnimatePresence = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
```

`frontend/src/app/stock-items/page.test.tsx` に `vi.mock('framer-motion')` を追加することで、このモックが使われる。アニメーション動作の確認は Playwright E2E で行う。

## 旧アプリとの対応

| 旧アプリ（Vue） | 新アプリ（React + Framer Motion） |
|----------------|----------------------------------|
| `<transition-group name="list">` | `<AnimatePresence>` |
| `.list-enter-active { transition: all 0.7s }` | `transition={{ duration: 0.5 }}` |
| `.list-leave-active { position: absolute }` | `exit` prop + Framer Motion が自動処理 |
| `.card-item { transition: all 0.7s }` | `layout` prop |
| `.list-enter / .list-leave-to { opacity: 0 }` | `initial` / `exit` の `opacity: 0` |
