## Context

Phase 1 では Tailwind CSS を採用し、ユーティリティクラスを直接 className に書く方針で実装してきた。現在のコンポーネント (`page.tsx`, `CreateItemModal.tsx`, `ItemCard.tsx`) は最小限のスタイルしか持たず、視覚階層・コントラスト・余白が不十分。

旧プロダクトは Buefy + Bulma 0.7/0.8 (purple をプライマリカラー、カード型レイアウト) を使っていた。最終的にこれと同等の見た目に揃えるが、Phase 1 の段階では現データモデル (name, category, wantToBuy のみ。inventories や imageUrl はまだ無い) の範囲で「ボタンらしいボタン」「読みやすいモーダル」を実現するのが先決。

## Goals / Non-Goals

**Goals:**
- 商品の登録・一覧・削除フローが視覚的にストレスなく使える状態にする
- 旧プロダクトの「purple ヘッダー」「カテゴリバッジ」の雰囲気を Tailwind で再現
- ボタンの主/副/破壊アクションを色で区別する
- モーダルダイアログのテキスト可読性を改善する

**Non-Goals:**
- inventories (賞味期限・個数) や画像表示の追加 — 別 change で扱う
- 検索・フィルタ・wantToBuy トグルの追加 — 別 change で扱う
- UI ライブラリ (shadcn/ui, Mantine 等) の導入 — 現時点では不要、将来再検討
- レスポンシブ対応の強化 — 既存の grid breakpoint は維持
- ダークモード対応

## Decisions

### Decision 1: スタイル定義の置き場所 — ユーティリティクラス直書き継続

className に Tailwind クラスを直接書く現方針を継続する。共通スタイルが増えてきたら `@apply` か CSS Modules に移行を検討する。

**Alternatives considered:**
- `@apply` でカスタムクラスを定義 (例: `.btn-primary`) — 共通化メリットはあるが、現状コンポーネント数が少なくオーバーキル
- shadcn/ui 導入 — 機能拡張時に再検討。今は依存追加のコストが見合わない

**Rationale:** 現在 button は 3 箇所、modal は 1 箇所のみ。共通化のための間接コストの方が高い。同じスタイルが 4 回以上重複するようになった時点で再検討する。

### Decision 2: カラーパレット — 旧プロダクトの Bulma カスタム色をそのまま採用

旧プロダクトは Bulma 0.7.5 を読み込んだ後にカスタム色で `is-primary` を上書きしている (CSS の後勝ち)。実際にレンダリングされる色を Tailwind のアービトラリ値 (`bg-[#xxxxxx]`) で再現する。

- **Primary 単色 (主アクションボタン)**: `#00d1b2` (teal) / hover `#00c4a7`
- **Primary グラデーション (ヘッダー、`is-primary is-bold` 相当)**: `linear-gradient(141deg, #009e6c, #00d1b2 71%, #00e7eb)`
  - Tailwind では `bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb]` で近似 (141deg は左上→右下方向で `to-br` に近い)
- **Primary Light (カテゴリバッジ)**: 背景 `#ebfffc` / 文字 `#00947e` (Bulma の `is-primary is-light` 値そのまま)
- **Danger (削除ボタン)**: `#ff3860` / hover `#ff2b56`
- **副アクション (キャンセル)**: `bg-gray-200 text-gray-800 hover:bg-gray-300` (Bulma の `.button` デフォルトに近いグレー)

**Alternatives considered:**
- Tailwind 標準の `teal-400` / `red-500` を使う — 色味が微妙に違って旧プロダクトと印象が変わる
- `tailwind.config.ts` でカスタム色 (`primary: "#00d1b2"` 等) を定義 — 4 箇所以上で同じ色を使うようになったら移行を検討。現状はアービトラリ値で十分

**Note:** 当初バイオレット (`#7957d5`) で設計したが、ユーザー指摘により旧 CSS を再確認したところ、後段に teal の上書き定義 (`#00d1b2`) があり、後勝ちで teal が実際の色だった。

### Decision 3: モーダルダイアログ — 既存構造維持、スタイルのみ修正

`role="dialog"` と固定背景オーバーレイの構造はそのまま、内側の余白・テキストサイズ・ボタン配置のみ調整する。

**変更点:**
- ボタンを横並び `flex justify-end gap-2` (キャンセルが左、追加が右の標準的な配置)
- ボタン幅は固定ではなく `px-4` で内容に応じる (`w-full` を外す)
- タイトル `text-xl` → `text-lg font-semibold`、余白 `mb-6`
- ラベル文字色を明示 (`text-gray-700`)
- 入力フォーカス時にボーダー色を変える (`focus:ring-2 focus:ring-[#00d1b2]`)

**Rationale:** 既存テストがアクセシビリティ属性 (role, label, button name) ベースで書かれているので、スタイルを変えても壊れない。

### Decision 4: ItemCard — カテゴリバッジ + 視覚階層

- 商品名を主役に (`text-lg font-bold`)
- カテゴリは小さなバッジ (`inline-block bg-[#ebfffc] text-[#00947e] text-xs px-2 py-0.5 rounded-full`) で商品名の上に配置 (旧プロダクトの `is-primary is-light` 相当)
- 削除ボタンは旧プロダクトと同じ `#ff3860` / hover `#ff2b56`
- 削除ボタンの位置は現状の `flex` 内右端配置を維持しつつ視認性を上げる
- カード自体に `shadow-sm hover:shadow-md` で立体感

**Alternatives considered:**
- カードを縦長レイアウトにして画像エリアを残す — 画像機能はまだないので不要
- 削除ボタンを 3 点メニュー (`...`) に格納 — モバイルなら有用だが現状はオーバーキル

### Decision 5: ヘッダー — 旧プロダクトと同じ teal グラデーション

`page.tsx` の最上部に追加。旧 Bulma `is-primary is-bold` のグラデーションを Tailwind で再現。
```tsx
<header className="bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb] text-white py-4 px-6">
  <h1 className="text-2xl font-bold">Pantry Panel</h1>
</header>
```
ナビゲーション項目はまだ追加しない (検索・フィルタが入った時点で再検討)。

`app/layout.tsx` ではなく `page.tsx` に配置する理由: 現状ページが 1 つしかなく、共通レイアウトに上げる必要性が薄い。複数ページが出てきたら layout に移す。

## Risks / Trade-offs

- **[既存テストが落ちるリスク]** → スタイル変更でアクセシビリティ属性 (role, label) は変えないため低リスク。CI で確認する
- **[旧プロダクトと完全一致しない見た目]** → Phase 1 の範囲では「雰囲気」までで OK。完全一致は将来の change で扱う
- **[Tailwind クラス文字列の長さ]** → JSX の className が長くなる傾向。可読性が下がってきたら `clsx` 導入や `@apply` への移行を検討
- **[スタイル変更により手動確認の負担増]** → 動作確認は user が実施。スクリーンショット差分はまだ自動化していない

## Migration Plan

不要 (UI のみの変更で、データやスキーマの移行はない)。

## Open Questions

- ヘッダーに将来追加するナビゲーション項目のレイアウト方針は、検索・フィルタ機能を追加する change で決める
- カテゴリごとの色分けバッジ (旧プロダクトに近づける) は本 change の範囲外。必要であれば後続 change で追加
