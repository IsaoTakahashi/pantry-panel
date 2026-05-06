## Context

商品一覧は現在 `ItemCard` 1種類のみで描画されており、すべての商品が同じカード形式で表示される。モバイル PWA メイン用途を考えると、情報密度を上げたシンプル表示の選択肢を提供することで一覧性を高められる。旧仕様にも Simple スイッチが存在していた。

## Goals / Non-Goals

**Goals:**
- 通常 / シンプルの2モードを切り替える UI を追加する
- シンプルモードを 1行表示の専用コンポーネントとして提供する
- 既存の編集・wantToBuy トグル動作を両モードで維持する

**Non-Goals:**
- 表示モードの永続化（localStorage / sessionStorage）
- 画面幅による自動切替（モバイル/デスクトップで分岐しない）
- シンプルモードでの削除操作（normal モードに切替えてから削除する運用）

## Decisions

### コンポーネント分離: ItemCard と ItemCardSimple を別ファイルに

`ItemCard` 内で `viewMode` prop による分岐ではなく、`ItemCardSimple` を新規作成して `StockItemsPage` 側で切り替える。

- **採用理由**: 各コンポーネントの責務が明確になり、JSX が分岐だらけにならない。テストも独立して書ける。両者は `onEdit` / `onToggleWantToBuy` / `onDelete` の同じ handler 型を受け取るため呼び出し側の差分は極小。
- **代替案**: `ItemCard` に `viewMode` prop を追加 → 1コンポーネントの責務が肥大、props 増やす方が複雑度が上がる。

### 状態管理: StockItemsPage の useState、永続化なし

`viewMode: "normal" | "simple"` を `StockItemsPage` に保持し、`FilterBar` に props で渡す。

- **採用理由**: コンポーネントツリーが浅いため Context 不要。永続化なしで初訪問時は常に normal が見える。
- **代替案**: localStorage 永続化 → 家庭で複数人が交互に使う場合に意図しないモードで開かれる懸念があり、優先度は低い。

### トグル UI: segmented control 風 (radio buttons)

`role="radiogroup"` で2つの `role="radio"` ボタンを横並びにする。選択中は teal ベタ塗り、非選択は控えめなグレー。

- **採用理由**: 2択である事が視覚的に明確。`🛒` トグルと同じカラーパターンで FilterBar 内のトーンを揃える。
- **代替案**: スイッチ（toggle switch） → 「通常 / シンプル」のラベルが見えにくい。Tab UI → 選択肢が増えた時だけ意味がある。

### Props 設計: `onDelete` を ItemCardSimple でも受け取る

`ItemCard` と `ItemCardSimple` は同じ props シグネチャ。`onDelete` はシンプルでは UI に出さないが、props としては受け取る。

- **採用理由**: 呼び出し側 (`StockItemsPage`) が viewMode で switch する際、props の組み立てを共通化できる。
- **代替案**: `Omit<ItemCardProps, "onDelete">` で型を引き締める → 過剰設計。シンプルから normal に切り替える際の handler 引き渡しが煩雑。

## Risks / Trade-offs

- シンプルモードで誤って削除したくても出来ない → 削除はそもそも頻度の低い操作で、モード切替を経由するワンクッションは UX 的に問題ない。
- `ItemCard` と `ItemCardSimple` のスタイルが乖離する可能性 → カテゴリバッジ・🛒トグルのスタイルは共通の Tailwind クラスを使い、レビューで一貫性を担保。
