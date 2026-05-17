## MODIFIED Requirements

### Requirement: アプリケーションヘッダー
ページ最上部に旧プロダクトと同じ teal グラデーション (`linear-gradient(141deg, #009e6c, #00d1b2, #00e7eb)`) のヘッダーが表示される SHALL。ヘッダーにはアプリケーション名 "Pantry Panel" が配置される MUST。

#### Scenario: ヘッダーの表示
- **WHEN** stock-items ページが描画される
- **THEN** ページ最上部に `bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb]` の背景、白文字 (`text-white`) のヘッダーが表示される
- **AND** ヘッダーの padding は `py-2 px-4` である

#### Scenario: タイトルの表示
- **WHEN** ヘッダーが描画される
- **THEN** "Pantry Panel" の見出しが `text-2xl font-bold` 以上で表示される

### Requirement: ページ全体レイアウト
ページコンテンツは適切な最大幅と余白を持ち、空状態・通常状態・エラー状態のいずれでも一貫した見た目を保つ SHALL。より多くの商品を一画面に表示できるよう余白は最小限に抑える MUST。

#### Scenario: コンテンツの最大幅
- **WHEN** 一覧・空状態・エラー状態のいずれかが描画される
- **THEN** メインコンテンツは最大幅 (`max-w-6xl` 程度) で中央寄せ (`mx-auto`)、`px-4` 以上の左右パディングを持つ
- **AND** 上下パディングは `py-4` である

#### Scenario: 空状態の表示
- **WHEN** 商品が 1 件もない状態
- **THEN** "商品がありません" のメッセージが中央寄せかつ余白を持って表示される (素のテキストが左寄せにならない)

#### Scenario: エラー状態の表示
- **WHEN** API エラーが発生した状態
- **THEN** エラーメッセージは赤系の文字色または背景で目立つように表示される

#### Scenario: 商品グリッドの gap
- **WHEN** 商品一覧グリッドが描画される
- **THEN** グリッドの gap は `gap-3` である

### Requirement: 商品カードの視覚階層
商品カードは商品名を主役として表示し、カテゴリをバッジ風の二次情報として表現する SHALL。削除ボタンはカード内で識別可能な位置に配置される MUST。

#### Scenario: 商品名の強調
- **WHEN** ItemCard が描画される
- **THEN** 商品名は `text-lg` 以上、`font-bold` で表示される

#### Scenario: カテゴリバッジ
- **WHEN** ItemCard が描画される
- **THEN** カテゴリは薄 teal 地 (`bg-[#ebfffc]`) に濃 teal 文字 (`text-[#00947e]`) のバッジ (`rounded-full px-2 py-0.5 text-xs`) として表示される (旧プロダクトの `is-primary is-light` 相当)

#### Scenario: カードの立体感
- **WHEN** ItemCard が描画される
- **THEN** `shadow-sm` の影を持ち、ホバー時は `hover:shadow-md` に変化する

#### Scenario: カード内余白
- **WHEN** ItemCard が描画される
- **THEN** カードの padding は `px-3 py-2`、要素間 gap は `gap-3` である
