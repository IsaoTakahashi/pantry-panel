## ADDED Requirements

### Requirement: Backend は Dockerfile でビルドできる
Backend のコードは `backend/Dockerfile` を使ってコンテナイメージにビルドできる SHALL。マルチステージビルドで static binary を最終イメージに含める MUST。

#### Scenario: ローカルでビルドできる
- **WHEN** リポジトリルートで `docker build -t pantry-panel-backend:local backend/` を実行する
- **THEN** ビルドが成功し、イメージが生成される

#### Scenario: イメージから起動できる
- **WHEN** ビルド済みイメージを `docker run -p 8080:8080 -e DATABASE_URL=... pantry-panel-backend:local` で起動する
- **THEN** `/health` が 200 を返す

### Requirement: Backend は PORT 環境変数で待ち受けポートを切り替える
Backend は `PORT` 環境変数を読み取り、その値で listen する SHALL。未設定時は 8080 を使用する MUST。

#### Scenario: PORT 指定で起動
- **WHEN** Backend を `PORT=9000` で起動する
- **THEN** `:9000` で listen する

#### Scenario: PORT 未設定で起動
- **WHEN** Backend を `PORT` 環境変数なしで起動する
- **THEN** `:8080` で listen する

### Requirement: Backend は CORS_ALLOWED_ORIGINS 環境変数で CORS 許可 origin を切り替える
Backend は `CORS_ALLOWED_ORIGINS`（カンマ区切り）を読み取り、Echo の CORS middleware の `AllowOrigins` に設定する SHALL。未設定時は `http://localhost:3000` を使用する MUST。

#### Scenario: 単一 origin
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS=https://example.vercel.app` で起動する
- **THEN** `https://example.vercel.app` からのリクエストに `Access-Control-Allow-Origin: https://example.vercel.app` を返す

#### Scenario: 複数 origin
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS=https://a.vercel.app,https://b.vercel.app` で起動する
- **THEN** どちらの origin からのリクエストにも対応する CORS ヘッダを返す

#### Scenario: 未設定時はローカル用
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS` 未設定で起動する
- **THEN** `http://localhost:3000` のみ許可する

### Requirement: Backend は ECR から App Runner にデプロイできる
Backend のコンテナイメージは AWS ECR (`ap-northeast-1`) にホストし、AWS App Runner サービスがそれを pull して稼働する SHALL。

#### Scenario: ECR 上にイメージが存在する
- **WHEN** Phase 2.5b 完了時点
- **THEN** `ap-northeast-1` の ECR リポジトリ `pantry-panel-backend` にビルド済みイメージが少なくとも 1 つ存在する

#### Scenario: App Runner が稼働中
- **WHEN** Phase 2.5b 完了時点
- **THEN** App Runner コンソールに `pantry-panel-backend` サービスが `Running` 状態で存在する
- **AND** サービス URL から `/health` が 200 を返す

### Requirement: App Runner は最小構成で稼働する
App Runner のインスタンスサイズは 0.25 vCPU / 0.5 GB MUST、Auto Scaling は min=1, max=1 とする MUST。

#### Scenario: スケール設定
- **WHEN** App Runner サービスの設定を確認する
- **THEN** インスタンスサイズが 0.25 vCPU / 0.5 GB
- **AND** min instances = max instances = 1

### Requirement: App Runner は /health をヘルスチェックに使用する
App Runner のヘルスチェック設定は `/health` をパスとして MUST 設定する。

#### Scenario: ヘルスチェック設定
- **WHEN** App Runner サービスの設定を確認する
- **THEN** Health check path が `/health`
- **AND** プロトコルが HTTP（コンテナ内通信のため）

### Requirement: 本番 API は HTTPS で外部から到達可能
App Runner サービス URL（`*.awsapprunner.com`）から HTTPS で API が応答する SHALL。

#### Scenario: 外部から /health に到達
- **WHEN** ブラウザまたは curl で `https://<service-url>/health` を叩く
- **THEN** 200 が返る

#### Scenario: 外部から CRUD API に到達
- **WHEN** ローカルの Frontend を `NEXT_PUBLIC_API_URL=https://<service-url>` で起動して操作する
- **THEN** 商品の登録・一覧表示・編集・削除が成功する
