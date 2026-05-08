## ADDED Requirements

### Requirement: Backend は Dockerfile でビルドできる
Backend のコードは `backend/Dockerfile` を使ってコンテナイメージにビルドできる SHALL。マルチステージビルドで static binary を最終イメージに含める MUST。

#### Scenario: ローカルでビルドできる
- **WHEN** リポジトリルートで `docker build --platform linux/amd64 -t pantry-panel-backend:local backend/` を実行する
- **THEN** ビルドが成功し、`linux/amd64` のイメージが生成される

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

### Requirement: Backend は ECR から ECS Express Mode サービスとしてデプロイできる
Backend のコンテナイメージは AWS ECR (`ap-northeast-1`) にホストし、AWS ECS Express Mode サービスがそれを Fargate タスクとして稼働させる SHALL。

#### Scenario: ECR 上にイメージが存在する
- **WHEN** Phase 2.5b 完了時点
- **THEN** `ap-northeast-1` の ECR リポジトリ `pantry-panel-backend` にビルド済みイメージ（`linux/amd64`）が少なくとも 1 つ存在する

#### Scenario: ECS Express サービスが稼働中
- **WHEN** Phase 2.5b 完了時点
- **THEN** ECS コンソールに `pantry-panel-backend` の Express Mode サービスが稼働中で存在する
- **AND** サービスが払い出す `*.ecs.ap-northeast-1.on.aws` URL から `/health` が 200 を返す

### Requirement: ECS Express サービスは最小構成で稼働する
ECS Express サービスのコンピュート設定は **Fargate の最小構成相当**（目安: 0.25 vCPU / 0.5 GB）MUST、Auto Scaling は min=max=1 とする MUST。

#### Scenario: スケール設定
- **WHEN** ECS Express サービスの設定を確認する
- **THEN** CPU / Memory が最小構成
- **AND** scaling target の minTaskCount = maxTaskCount = 1

### Requirement: ECS Express は /health をヘルスチェックに使用する
ECS Express サービスのヘルスチェック設定は `--health-check-path` を `/health` に MUST 設定する。

#### Scenario: ヘルスチェック設定
- **WHEN** ECS Express サービスの設定を確認する
- **THEN** Health check path が `/health` である

### Requirement: 機密情報は Secrets Manager 経由で渡す
`DATABASE_URL` は AWS Secrets Manager に保管し、ECS タスク定義の `secrets` 機構（`valueFrom` で ARN 参照）で注入する MUST。`environment` フィールドに平文で書かない MUST。

#### Scenario: Secrets Manager に登録
- **WHEN** Phase 2.5b 完了時点
- **THEN** AWS Secrets Manager に `pantry-panel/DATABASE_URL` 等の名前のシークレットが存在し、Phase 2.5a の Supabase 接続文字列を保持している

#### Scenario: Task が secrets を読み込める
- **WHEN** ECS Express サービスを起動する
- **THEN** Task execution role に Secrets Manager の対象シークレットへの `Read` 権限が付与されている
- **AND** Task 定義の `secrets` フィールドで `DATABASE_URL` の `valueFrom` がシークレット ARN を指している

### Requirement: 本番 API は HTTPS で外部から到達可能
ECS Express が払い出す `*.ecs.ap-northeast-1.on.aws` URL から HTTPS で API が応答する SHALL。

#### Scenario: 外部から /health に到達
- **WHEN** ブラウザまたは curl で `https://<service-url>/health` を叩く
- **THEN** 200 が返る

#### Scenario: 外部から CRUD API に到達
- **WHEN** ローカルの Frontend を `NEXT_PUBLIC_API_URL=https://<service-url>` で起動して操作する
- **THEN** 商品の登録・一覧表示・編集・削除が成功する
