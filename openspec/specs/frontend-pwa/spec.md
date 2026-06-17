# frontend-pwa Specification

## Purpose
TBD - created by archiving change frontend-pwa-and-modal-polish. Update Purpose after archive.
## Requirements
### Requirement: アプリは PWA としてインストール可能
Frontend は Web App Manifest を提供し、対応ブラウザで「ホーム画面に追加」「アプリをインストール」UI が利用可能となる SHALL。

#### Scenario: マニフェストが配信される
- **WHEN** ブラウザで `/manifest.webmanifest` を取得する
- **THEN** JSON が返り、`name`、`short_name`、`start_url`、`display`、`icons` を含む

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
- favicon は `frontend/src/app/favicon.ico`（ブランドカラー teal 背景の棚ピクトグラム）を使用する MUST
- apple-touch-icon は `icon-192.png` を参照する MUST

#### Scenario: ページタイトル
- **WHEN** ブラウザで任意のページを開く
- **THEN** タブのタイトルが `Pantry Panel` で始まる

#### Scenario: favicon が表示される
- **WHEN** ブラウザでページを開く
- **THEN** Next.js metadata により `favicon.ico` が favicon として参照される

### Requirement: アプリは Service Worker を登録する
Frontend は本番ビルドで Service Worker (`/sw.js`) を配信し、ブラウザで自動登録する SHALL。スコープは `/` MUST。開発時 (`npm run dev`) は SW を生成・登録しない MUST。

#### Scenario: 本番で /sw.js が配信される
- **WHEN** 本番 URL で `/sw.js` を取得する
- **THEN** HTTP 200 で Service Worker スクリプトが返る

#### Scenario: 本番でブラウザが SW を登録する
- **WHEN** 本番でページを開き `navigator.serviceWorker.ready` を待つ
- **THEN** 登録された Service Worker のスコープが `/` である

#### Scenario: 開発モードでは /sw.js を返さない
- **WHEN** `npm run dev` で起動したサーバの `/sw.js` を取得する
- **THEN** HTTP 200 で SW スクリプトを返さない（404 または空ファイル）

### Requirement: Service Worker は静的アセットを pre-cache する
SW は install 時に Next.js 静的アセット（`/_next/static/chunks/*`, `/_next/static/media/*`）、アイコン (`/icon-192.png`, `/icon-512.png`, `/favicon.ico`)、`/manifest.webmanifest` を pre-cache する MUST。shell HTML（`/stock-items` のレスポンス）は pre-cache の対象に含めない MUST。デプロイをまたいで古い chunk ハッシュを参照する HTML が永続化することを防ぐためである。

#### Scenario: pre-cache 対象に静的アセットが含まれる
- **WHEN** SW の生成された pre-cache manifest を確認する
- **THEN** `/_next/static/chunks/*`、`/_next/static/media/*`、`/icon-192.png`、`/icon-512.png`、`/favicon.ico`、`/manifest.webmanifest` のエントリが存在する

#### Scenario: shell HTML は pre-cache されない
- **WHEN** SW の生成された pre-cache manifest を確認する
- **THEN** `/stock-items` の HTML エントリは存在しない

#### Scenario: install 後にキャッシュへ書き込まれる
- **WHEN** ブラウザで初回アクセスし SW が install される
- **THEN** CacheStorage に pre-cache manifest 内の全アセットが書き込まれる

### Requirement: Service Worker のランタイムキャッシュ戦略
SW は以下のランタイムキャッシュ戦略を MUST 適用する:
- API (`/api/*`、Lambda Function URL 宛て): **NetworkOnly**（キャッシュしない）
- 静的アセット（`/_next/static/*`, `/icon-*.png`, `/favicon.ico`, `/manifest.webmanifest`）: **CacheFirst**
- shell HTML（`document` destination）: **NetworkFirst**。オンライン時は常に最新の HTML を取得し、取得成功時はキャッシュを更新する。ネットワーク失敗時のみキャッシュ済 HTML にフォールバックする MUST。

#### Scenario: API レスポンスはキャッシュされない
- **WHEN** SW が `/api/stock-items` のレスポンスを受け取る
- **THEN** CacheStorage に保存されない

#### Scenario: 静的アセットはキャッシュ優先で返る
- **WHEN** キャッシュ済の `_next/static/chunks/*` を再リクエストする
- **THEN** ネットワーク非依存でキャッシュから返る

#### Scenario: shell HTML はオンライン時に最新を取得する
- **WHEN** オンラインでキャッシュ済の `/stock-items` HTML を再リクエストする
- **THEN** ネットワークから最新 HTML が返り、その内容で次回向けにキャッシュが更新される

#### Scenario: shell HTML はオフライン時にキャッシュへフォールバックする
- **WHEN** オフラインで `/stock-items` HTML をリクエストし、ネットワーク取得が失敗する
- **THEN** キャッシュ済 HTML が返る

### Requirement: Service Worker は新バージョン配信時に即時有効化する
新しい SW がデプロイされたとき、`skipWaiting` と `clients.claim` で次回 PWA 起動またはタブ再読込時に即有効化される MUST。ユーザーへの再追加操作は不要 MUST。

#### Scenario: 新 SW が install されたら待機せず activate する
- **WHEN** 新バージョンの `/sw.js` がブラウザで install される
- **THEN** install イベント完了時点で `skipWaiting()` が呼ばれ、activate に進む

#### Scenario: activate 後に既存タブをクレームする
- **WHEN** 新 SW が activate される
- **THEN** `clients.claim()` が実行され、既存タブの fetch が新 SW 経由になる

### Requirement: 既存 PWA インストールは Service Worker 導入によって失われない
本変更のデプロイ後、ユーザーが既にホーム画面に追加済の PWA は再追加なしで SW の恩恵を受ける MUST。manifest の `start_url`, `name`, アイコンは変更しない MUST。

#### Scenario: 既存ホーム画面ショートカットは引き続き起動する
- **WHEN** デプロイ前に追加済の PWA ショートカットからアプリを開く
- **THEN** 同じ `start_url` (`/stock-items`) が開き、SW が自動 install される

### Requirement: Playwright E2E テストは Service Worker の影響を受けない
既存 E2E テスト群（`mock` / `preview` project）は Service Worker を `block` 設定にして、SW キャッシュに起因する flakiness を防ぐ MUST。SW 専用の挙動を検証するテストは独立した spec ファイルで実装する MUST。

#### Scenario: mock project は SW を block する
- **WHEN** `playwright.config.ts` の `mock` project 設定を読む
- **THEN** `use.serviceWorkers` が `"block"` に設定されている

#### Scenario: preview project は SW を block する
- **WHEN** `playwright.config.ts` の `preview` project 設定を読む
- **THEN** `use.serviceWorkers` が `"block"` に設定されている

#### Scenario: SW 専用 E2E が独立ファイルで存在する
- **WHEN** `e2e/` 配下を確認する
- **THEN** SW の pre-cache 挙動を検証する独立した spec ファイル（例: `service-worker.spec.ts`）が存在する

### Requirement: チャンク読み込み失敗時の自己回復
Frontend は遅延読み込みされる JS チャンクの取得失敗（ChunkLoadError 相当）を検知したとき、CacheStorage の削除と Service Worker の登録解除を行い、一度だけページをリロードして回復を試みる MUST。リロードのループを防ぐため、回復試行は1回に制限する MUST（例: `sessionStorage` のフラグでガードする）。これにより、古い shell/chunk を保持して固まっている既存端末を次回アクセスで救済する。

#### Scenario: ChunkLoadError でキャッシュ削除・SW 解除・リロードする
- **WHEN** 遅延読み込みされるチャンクの取得に失敗し ChunkLoadError が発生する
- **AND** 当該セッションでまだ回復を試行していない
- **THEN** CacheStorage が削除され、Service Worker が登録解除され、ページが一度だけリロードされる

#### Scenario: リロードは一度だけに制限される
- **WHEN** 回復リロード後に再び ChunkLoadError が発生する
- **AND** 当該セッションで既に回復を試行済みである
- **THEN** 再度のリロードは行わない（無限ループしない）

