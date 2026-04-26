# ui-style-guide Specification

## Purpose
TBD - created by archiving change phase1-ui-polish. Update Purpose after archive.
## Requirements
### Requirement: ボタンの視覚的識別
すべてのボタン要素は背景色・パディング・ホバー状態を持ち、視覚的に「ボタン」として認識できる SHALL 状態とする。アクションの種類に応じて主アクション・副アクション・破壊的アクションの 3 種を色で区別する MUST。

#### Scenario: 主アクションボタン (追加・登録)
- **WHEN** 商品追加ボタンや登録ボタンが描画される
- **THEN** teal 背景 (`bg-[#00d1b2]`) と白文字、ホバーで濃い teal (`hover:bg-[#00c4a7]`)、`px-4 py-2` 以上のパディングを持つ

#### Scenario: 副アクションボタン (キャンセル)
- **WHEN** モーダルのキャンセルボタンが描画される
- **THEN** グレー系背景 (`bg-gray-200`) と濃いグレー文字、ホバーで濃いグレー背景の状態変化を持つ

#### Scenario: 破壊的アクションボタン (削除)
- **WHEN** 商品削除ボタンが描画される
- **THEN** 赤系背景 (`bg-[#ff3860]`) と白文字、ホバーで濃い赤 (`hover:bg-[#ff2b56]`) の状態変化を持つ

### Requirement: モーダルダイアログの可読性
モーダルダイアログ内のすべてのテキスト・ラベル・入力欄は、十分なコントラストと余白を持ち、可読性の高い状態で表示される SHALL。

#### Scenario: モーダルタイトルの視認性
- **WHEN** モーダルが開かれる
- **THEN** タイトル "商品を追加" は本文より大きく (`text-lg` 以上)、`font-semibold` 以上の太さで表示される

#### Scenario: ラベルとコントラスト
- **WHEN** 入力欄のラベルが描画される
- **THEN** ラベル文字色は `text-gray-700` 相当 (背景白に対して WCAG AA 以上のコントラスト) を持つ

#### Scenario: 入力欄のフォーカス状態
- **WHEN** 入力欄がフォーカスされる
- **THEN** ボーダーまたはリングがアクセント色 (`focus:ring-2 focus:ring-[#00d1b2]` 相当) で強調される

#### Scenario: ボタン配置
- **WHEN** モーダル下部にキャンセル・追加ボタンが描画される
- **THEN** ボタンは横並び (`flex`) で右寄せ (`justify-end`) または右端配置となり、`gap-2` 以上の間隔を持つ

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

### Requirement: アプリケーションヘッダー
ページ最上部に旧プロダクトと同じ teal グラデーション (`linear-gradient(141deg, #009e6c, #00d1b2, #00e7eb)`) のヘッダーが表示される SHALL。ヘッダーにはアプリケーション名 "Pantry Panel" が配置される MUST。

#### Scenario: ヘッダーの表示
- **WHEN** stock-items ページが描画される
- **THEN** ページ最上部に `bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb]` の背景、白文字 (`text-white`) のヘッダーが表示される

#### Scenario: タイトルの表示
- **WHEN** ヘッダーが描画される
- **THEN** "Pantry Panel" の見出しが `text-2xl font-bold` 以上で表示される

### Requirement: ページ全体レイアウト
ページコンテンツは適切な最大幅と余白を持ち、空状態・通常状態・エラー状態のいずれでも一貫した見た目を保つ SHALL。

#### Scenario: コンテンツの最大幅
- **WHEN** 一覧・空状態・エラー状態のいずれかが描画される
- **THEN** メインコンテンツは最大幅 (`max-w-6xl` 程度) で中央寄せ (`mx-auto`)、`px-4` 以上の左右パディングを持つ

#### Scenario: 空状態の表示
- **WHEN** 商品が 1 件もない状態
- **THEN** "商品がありません" のメッセージが中央寄せかつ余白を持って表示される (素のテキストが左寄せにならない)

#### Scenario: エラー状態の表示
- **WHEN** API エラーが発生した状態
- **THEN** エラーメッセージは赤系の文字色または背景で目立つように表示される

