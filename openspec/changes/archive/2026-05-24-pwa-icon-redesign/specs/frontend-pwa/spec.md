## MODIFIED Requirements

### Requirement: アイコンが配信される
PWA マニフェストは 192×192 と 512×512 の 2 サイズのアイコンを個別ファイルで提供する SHALL。アイコンはブランドカラー（`#00d1b2`）を背景に、白抜きの3段棚ピクトグラムを描いた PNG MUST。

#### Scenario: 192px アイコンが配信される
- **WHEN** ブラウザで `/icon-192.png` を取得する
- **THEN** 192×192 PNG が返る（Vercel デプロイ後）

#### Scenario: 512px アイコンが配信される
- **WHEN** ブラウザで `/icon-512.png` を取得する
- **THEN** 512×512 PNG が返る（Vercel デプロイ後）

#### Scenario: manifest の icons エントリが 2 つある
- **WHEN** `/manifest.webmanifest` を取得する
- **THEN** `icons` 配列に `{ src: "/icon-192.png", sizes: "192x192" }` と `{ src: "/icon-512.png", sizes: "512x512" }` の 2 エントリが含まれる

### Requirement: ページタイトルとファビコン
- ブラウザタブのタイトルは `"Pantry Panel"` MUST
- favicon は `frontend/src/app/favicon.ico`（ブランドカラー teal 背景の棚ピクトグラム）を使用する MUST
- apple-touch-icon は `icon-192.png` を参照する MUST

#### Scenario: ページタイトル
- **WHEN** ブラウザで任意のページを開く
- **THEN** タブのタイトルが `Pantry Panel` で始まる

#### Scenario: favicon が表示される
- **WHEN** ブラウザでページを開く
- **THEN** Next.js metadata により `favicon.ico` が favicon として参照される
