## Context

商品一覧は現在 `ItemCard` 1種類のみで描画されており、すべての商品が同じカード形式で表示される。モバイル PWA メイン用途を考えると、情報密度を上げたシンプル表示の選択肢を提供することで一覧性を高められる。旧仕様にも Simple スイッチが存在していた。

## Goals / Non-Goals

**Goals:**
- 通常 / シンプルの2モードを切り替える UI を追加する
- シンプルモードを 1行表示の専用コンポーネントとして提供する
- 既存の編集・wantToBuy トグル動作を両モードで維持する
- PWA 利用前提で FilterBar を読みやすくレイアウトする（横幅の狭いモバイルでの可読性優先）

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

### FilterBar 3段レイアウト

PWA・モバイル幅優先で、`FilterBar` を以下の3段構成にする。

| 段 | 内容 |
|----|------|
| 1段目 | 検索 input（フル幅） |
| 2段目 | 🛒 wantToBuy トグルボタン + カテゴリ select |
| 3段目 | 表示モード（通常 ⇄ シンプル）スライダー型スイッチ |

- **採用理由**: 検索が一番頻度の高い操作で、フル幅にするのがモバイルで打ちやすい。フィルタ系（🛒・カテゴリ）は2段目に集約。表示モードはセッション中で変える頻度が低いため独立した3段目に。
- **代替案**: 1段に詰める → モバイル幅で折り返し・タップ精度低下。

### 🛒 wantToBuy フィルタはアイコンボタン

「買いたいものだけ」ラベル付き checkbox から、🛒 単体のアイコンボタンに置き換える。

- **採用理由**: ラベル文字列を表示しない分、モバイルで他要素と並べやすい。`ItemCard` 内の wantToBuy トグルと同じ配色 (active=teal, inactive=gray) で全体のトーンを揃える。意味は `aria-label="買いたいものだけ"` で確保する。
- **代替案**: ラベル付きを維持 → モバイル幅で他要素と並べると窮屈。

### 表示モード: `role="switch"` のスライダー型 (旧 segmented control を置換)

選択肢が「通常 / シンプル」の2値であるため、segmented control（radio group）から **トグルスイッチ** (`role="switch"`) に変更する。

- **実装**: 1個の `<button role="switch" aria-checked={viewMode === "simple"}>` で実装する。視覚的には pill 形コンテナ内に「通常」「シンプル」の両ラベルを常時表示し、アクティブ側のみ teal 背景・白文字、もう一方はグレー文字。クリックで他方へ切り替わる。
- **採用理由**: 「on / off」の2値を扱う標準パターンが `role="switch"`。a11y ベストプラクティスに沿う。
- **代替案**: radio group のまま見た目だけスライダー風 → 2択の意味は switch のほうが自然で、要素数も削減できる。

### 入力系の文字色を明示

input / select / option のテキスト色をブラウザ既定（薄い灰色になる場合あり）に依存せず `text-gray-900` を明示する。プレースホルダーは慣例どおり薄い灰色を維持。

- **採用理由**: 入力済み値・選択済み値が視認しづらい問題を解消。プレースホルダーとの視覚差で「入力済み」が判別しやすくなる。

### Props 設計: `onDelete` を ItemCardSimple でも受け取る

`ItemCard` と `ItemCardSimple` は同じ props シグネチャ。`onDelete` はシンプルでは UI に出さないが、props としては受け取る。

- **採用理由**: 呼び出し側 (`StockItemsPage`) が viewMode で switch する際、props の組み立てを共通化できる。
- **代替案**: `Omit<ItemCardProps, "onDelete">` で型を引き締める → 過剰設計。シンプルから normal に切り替える際の handler 引き渡しが煩雑。

## Risks / Trade-offs

- シンプルモードで誤って削除したくても出来ない → 削除はそもそも頻度の低い操作で、モード切替を経由するワンクッションは UX 的に問題ない。
- `ItemCard` と `ItemCardSimple` のスタイルが乖離する可能性 → カテゴリバッジ・🛒トグルのスタイルは共通の Tailwind クラスを使い、レビューで一貫性を担保。
- `role="switch"` への移行で既存テスト（`role="radiogroup"` / `role="radio"` / `aria-checked` ベース）の書き換えが必要。
