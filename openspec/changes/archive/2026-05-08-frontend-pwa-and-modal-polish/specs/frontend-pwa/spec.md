## ADDED Requirements

### Requirement: アプリは PWA としてインストール可能
Frontend は Web App Manifest を提供し、対応ブラウザで「ホーム画面に追加」「アプリをインストール」UI が利用可能となる SHALL。

#### Scenario: マニフェストが配信される
- **WHEN** ブラウザで `/manifest.webmanifest` を取得する
- **THEN** JSON が返り、`name`、`short_name`、`start_url`、`display`、`icons` を含む

#### Scenario: アイコンが配信される
- **WHEN** ブラウザで `/icon.png` を取得する
- **THEN** 512×512 PNG が返る（Vercel デプロイ後）

### Requirement: Manifest は本番起点として `/stock-items` を指定する
Web App Manifest の `start_url` は `/stock-items` に MUST 設定する。インストール後のアプリ起動で商品一覧が直接開く。

#### Scenario: start_url の値
- **WHEN** Manifest を取得する
- **THEN** `start_url` が `"/stock-items"` である

### Requirement: アプリのテーマカラーは旧仕様の teal に揃える
Manifest の `theme_color` および `background_color` を Pantry Panel ブランド色に MUST 設定する。
- `theme_color`: `#00d1b2` (旧仕様 teal)
- `background_color`: `#ffffff`

#### Scenario: テーマカラー
- **WHEN** Manifest を取得する
- **THEN** `theme_color` と `background_color` が上記の値で設定されている

### Requirement: ページタイトルとファビコン
- ブラウザタブのタイトルは `"Pantry Panel"` MUST
- favicon / apple-touch-icon は `frontend/public/icon.png` を参照する MUST

#### Scenario: ページタイトル
- **WHEN** ブラウザで任意のページを開く
- **THEN** タブのタイトルが `Pantry Panel` で始まる

#### Scenario: favicon が表示される
- **WHEN** ブラウザでページを開く
- **THEN** `<link rel="icon">` または Next.js metadata により `icon.png` が favicon として参照される
