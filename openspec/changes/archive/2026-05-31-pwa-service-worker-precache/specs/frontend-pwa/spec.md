## ADDED Requirements

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
SW は install 時に shell HTML（`/stock-items` のレスポンス）と Next.js 静的アセット（`/_next/static/chunks/*`, `/_next/static/media/*`）、アイコン (`/icon-192.png`, `/icon-512.png`, `/favicon.ico`)、`/manifest.webmanifest` を pre-cache する MUST。

#### Scenario: pre-cache 対象に shell HTML と静的アセットが含まれる
- **WHEN** SW の生成された pre-cache manifest を確認する
- **THEN** `/stock-items` の HTML、`/_next/static/chunks/*`、`/_next/static/media/*`、`/icon-192.png`、`/icon-512.png`、`/favicon.ico`、`/manifest.webmanifest` のエントリが存在する

#### Scenario: install 後にキャッシュへ書き込まれる
- **WHEN** ブラウザで初回アクセスし SW が install される
- **THEN** CacheStorage に pre-cache manifest 内の全アセットが書き込まれる

### Requirement: Service Worker のランタイムキャッシュ戦略
SW は以下のランタイムキャッシュ戦略を MUST 適用する:
- API (`/api/*`、Lambda Function URL 宛て): **NetworkOnly**（キャッシュしない）
- 静的アセット（`/_next/static/*`, `/icon-*.png`, `/favicon.ico`, `/manifest.webmanifest`）: **CacheFirst**
- shell HTML（`document` destination）: **StaleWhileRevalidate**

#### Scenario: API レスポンスはキャッシュされない
- **WHEN** SW が `/api/stock-items` のレスポンスを受け取る
- **THEN** CacheStorage に保存されない

#### Scenario: 静的アセットはキャッシュ優先で返る
- **WHEN** キャッシュ済の `_next/static/chunks/*` を再リクエストする
- **THEN** ネットワーク非依存でキャッシュから返る

#### Scenario: shell HTML はキャッシュを即返しつつ裏で更新する
- **WHEN** キャッシュ済の `/stock-items` HTML を再リクエストする
- **THEN** キャッシュ済 HTML が即返り、別途バックグラウンドでネットワーク取得され次回向けにキャッシュ更新される

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
