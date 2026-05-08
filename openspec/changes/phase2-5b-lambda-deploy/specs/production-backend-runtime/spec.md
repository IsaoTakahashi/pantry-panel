## ADDED Requirements

### Requirement: Backend は Dockerfile + Lambda Web Adapter でビルドできる
Backend のコンテナイメージは `backend/Dockerfile` を使ってビルドでき、Lambda Web Adapter (LWA) レイヤを含む SHALL。multi-stage ビルドで static binary + LWA を最終イメージに同梱する MUST。

#### Scenario: ローカルでビルドできる
- **WHEN** リポジトリルートで `docker build --platform linux/amd64 -t pantry-panel-backend:local backend/` を実行する
- **THEN** ビルドが成功し、`linux/amd64` のイメージが生成される
- **AND** イメージ内に `/opt/extensions/lambda-adapter` が存在する

#### Scenario: ローカル起動時は LWA は使われない
- **WHEN** ビルド済みイメージを `docker run -p 8080:8080 -e DATABASE_URL=... pantry-panel-backend:local` で起動する
- **THEN** LWA は起動せず Echo が直接 8080 で listen する
- **AND** `/health` が 200 を返す（既存挙動を維持）

### Requirement: Backend は AWS Lambda Function として実行できる
Backend のコンテナイメージは AWS Lambda の container image source として実行できる SHALL。Lambda 環境では LWA が自動的に Echo の前段に入り、Lambda invocation を HTTP リクエストに変換する。

#### Scenario: Lambda 上で /health が応答する
- **WHEN** Lambda Function を作成しコンテナイメージを設定する
- **AND** Function URL を有効化して URL を叩く
- **THEN** `/health` が 200 + `{"db":"connected","status":"ok"}` を返す

### Requirement: Backend は PORT 環境変数で待ち受けポートを切り替える（既存）
Backend は `PORT` 環境変数を読み取り、その値で listen する SHALL。Lambda 環境では LWA との整合のため `PORT=8080` を MUST 指定する。

#### Scenario: Lambda 上で PORT=8080
- **WHEN** Lambda の環境変数で `PORT=8080` を指定する
- **THEN** Echo は `:8080` で listen する
- **AND** LWA は `AWS_LWA_PORT=8080` で同じポートを参照する

### Requirement: Backend は CORS_ALLOWED_ORIGINS 環境変数で CORS 許可 origin を切り替える（既存）
Backend は `CORS_ALLOWED_ORIGINS`（カンマ区切り）を読み取り、Echo の CORS middleware の `AllowOrigins` に設定する SHALL。未設定時は `http://localhost:3000` を使用する MUST。

#### Scenario: Lambda 上で複数 origin
- **WHEN** Lambda の環境変数 `CORS_ALLOWED_ORIGINS=https://a.vercel.app,http://localhost:3000` で起動する
- **THEN** どちらの origin からのリクエストにも対応する CORS ヘッダを返す

### Requirement: Function URL は HTTPS で外部から到達可能
Lambda Function URL（`https://<id>.lambda-url.ap-northeast-1.on.aws`）から HTTPS で API が応答する SHALL。Auth Type は初期構築では `NONE`（公開、後段で CORS により origin 制限）MUST とする。

#### Scenario: 外部から /health に到達
- **WHEN** ブラウザまたは curl で `https://<function-url>/health` を叩く
- **THEN** 200 が返る

#### Scenario: 外部から CRUD API に到達
- **WHEN** ローカルの Frontend を `NEXT_PUBLIC_API_URL=https://<function-url>` で起動して操作する
- **THEN** 商品の登録・一覧表示・編集・削除が成功する

### Requirement: 機密情報は Secrets Manager から Lambda extension 経由で注入する
`DATABASE_URL` は AWS Secrets Manager に保管し、AWS Parameters and Secrets Lambda Extension または同等機構で Lambda 環境変数として注入する MUST。Lambda 設定の Environment variables に平文で書かない MUST。

#### Scenario: Secrets Manager に登録（既存）
- **WHEN** Phase 2.5b 完了時点
- **THEN** AWS Secrets Manager に `pantry-panel/DATABASE_URL` 等のシークレットが存在し、Phase 2.5a の Supabase 接続文字列を保持している

#### Scenario: Lambda が secrets を読み込める
- **WHEN** Lambda Function を起動する
- **THEN** Lambda execution role が Secrets Manager の対象シークレットへの `GetSecretValue` 権限を持つ
- **AND** `DATABASE_URL` 環境変数として Backend に値が届く

### Requirement: Lambda Function は最小構成で動作する
Lambda Function の Memory は **512 MB** MUST、Timeout は **30 秒** 以下 MUST、Architecture は **x86_64** MUST（初回構築時）。

#### Scenario: 設定確認
- **WHEN** Lambda Function の設定を確認する
- **THEN** Memory が 512 MB
- **AND** Timeout が 30 秒以下
- **AND** Architecture が `x86_64`

### Requirement: Lambda execution role は最小権限で構成する
Lambda execution role は次の権限を MUST 持つ:
- AWS managed `AWSLambdaBasicExecutionRole`（CloudWatch Logs 書込）
- 対象 ECR repository の image pull 権限
- 対象 Secrets Manager の `GetSecretValue` 権限

それ以外の権限は MUST NOT 持つ。

#### Scenario: 権限確認
- **WHEN** Lambda execution role を確認する
- **THEN** `AWSLambdaBasicExecutionRole` がアタッチされている
- **AND** ECR `BatchGetImage` / `GetDownloadUrlForLayer` の権限を対象リポジトリに対して持つ
- **AND** Secrets Manager `GetSecretValue` の権限を対象シークレット ARN に対して持つ
- **AND** その他のサービス権限を持たない

### Requirement: 既存 ECS 関連 IAM Role を整理する
方針転換に伴い、ECS Express 用に作成した IAM Role を整理する SHALL。

- `ecsInfrastructureRoleForExpressServices`: **削除** MUST（不要、再利用不可）
- `ecsTaskExecutionRole`: **削除または保持** どちらでも可（Lambda execution role と権限が重複するため再利用は混乱を招く。新規作成を推奨）

#### Scenario: 不要 Role 削除
- **WHEN** Phase 2.5b 完了時点
- **THEN** `ecsInfrastructureRoleForExpressServices` は削除済 または 別用途で再利用していることが明示されている
