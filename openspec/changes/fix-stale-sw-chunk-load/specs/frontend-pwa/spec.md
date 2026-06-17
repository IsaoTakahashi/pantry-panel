## MODIFIED Requirements

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

## ADDED Requirements

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
