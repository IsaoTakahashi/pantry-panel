# production-backend-runtime Specification

## Purpose
TBD - created by archiving change phase2-5b-lambda-deploy. Update Purpose after archive.
## Requirements
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
- **WHEN** ローカルの Frontend を `NEXT_PUBLIC_API_BASE_URL=https://<function-url>` で起動して操作する
- **THEN** 商品の登録・一覧表示・編集・削除が成功する

### Requirement: Function URL の resource policy は `lambda:InvokeFunctionUrl` と `lambda:InvokeFunction` 双方を Principal `*` に許可する
Function URL の Auth Type が `NONE` の場合、AWS は `lambda:InvokeFunctionUrl` に加えて `lambda:InvokeFunction` の Principal `*` 許可を要求する MUST（実装時の動作確認で判明）。両 Action を resource-based policy に MUST 追加する。

#### Scenario: ポリシー存在
- **WHEN** `aws lambda get-policy --function-name pantry-panel-backend` を実行
- **THEN** 出力に `lambda:InvokeFunctionUrl` を許可する Statement（FunctionUrlAuthType=NONE 条件付き）が含まれる
- **AND** `lambda:InvokeFunction` を Principal `*` に許可する Statement が含まれる

> **セキュリティ注意（後日強化）**: `lambda:InvokeFunction` を Principal `*` で許可するのは過剰権限。任意の AWS アカウントから `lambda:Invoke` できる状態。Phase 2.5d 以降 / 別 change で **IP 制限 / Source ARN 条件 / API Gateway 経由化** などで締める TODO。

### Requirement: Function URL の CORS 制御は Echo ミドルウェアで行う
Function URL の `--cors` 設定は **空 (`{}`)** にする MUST。Backend の Echo CORS middleware（`CORS_ALLOWED_ORIGINS` 環境変数駆動）が CORS ヘッダを返す唯一のレイヤとする MUST。Function URL CORS と Echo CORS の二重処理を MUST 回避する。

#### Scenario: Function URL CORS 無効
- **WHEN** `aws lambda get-function-url-config --function-name pantry-panel-backend --query Cors` を実行
- **THEN** `null` または空オブジェクト（`{}`）が返る

#### Scenario: Echo の CORS ヘッダが返る
- **WHEN** ブラウザから `Origin: http://localhost:3000` でリクエストを送る
- **THEN** レスポンスヘッダに `Access-Control-Allow-Origin: http://localhost:3000` が **1 個だけ** 含まれる（重複しない）

### Requirement: Lambda は Supabase Supavisor Pooler 経由で接続する
Lambda は IPv6 outbound 非対応のため、Supabase Direct Connection（IPv6 only）には接続できない MUST。代わりに **Supavisor Session Pooler**（`aws-*-<region>.pooler.supabase.com:5432`、IPv4 対応）を使用する SHALL。

#### Scenario: DATABASE_URL は Pooler を指す
- **WHEN** Lambda の `DATABASE_URL` 環境変数を確認する
- **THEN** ホスト部分が `*.pooler.supabase.com` であり、ユーザ部分が `postgres.<project-ref>` 形式である

#### Scenario: ローカル開発は Direct でも Pooler でも可
- **WHEN** ローカル開発で Backend を起動する
- **THEN** Direct Connection でも Pooler でも動作する（IPv4 利用環境のため）

> Phase 2.5a の `production-database` capability では Direct Connection を MUST としていたが、これは **Phase 3 の自前 WebSocket で LISTEN/NOTIFY を使う前提**だった。Phase 3 を学習目的に格下げした方針転換に伴い、本番では Pooler を採用する。`production-database` の本仕様修正は別 change で扱う TODO。

### Requirement: DATABASE_URL は Lambda 環境変数で KMS 暗号化保存する
`DATABASE_URL`（Supabase 接続文字列）は Lambda Function の Environment.Variables に直接保持する MUST。Lambda の env vars は KMS で暗号化保存され、閲覧には IAM `lambda:GetFunctionConfiguration` 権限が必要 MUST。

#### Scenario: env で接続文字列を保持
- **WHEN** Phase 2.5b 完了時点
- **THEN** Lambda Function の Environment.Variables に `DATABASE_URL` キーで Supabase Direct Connection 文字列が設定されている
- **AND** Lambda は KMS（AWS managed key または customer managed key）で env vars を暗号化している

#### Scenario: Backend が DATABASE_URL を読める
- **WHEN** Lambda Function が起動する
- **THEN** `os.Getenv("DATABASE_URL")` で接続文字列が読み取れる
- **AND** `pgxpool.New` で Supabase に接続できる

#### Scenario: Secrets Manager の secret は別用途で残す
- **WHEN** Phase 2.5b 完了時点
- **THEN** AWS Secrets Manager の `pantry-panel/DATABASE_URL` は削除されておらず、Phase 2.5d (GH Actions deploy) などの将来の自動化での値供給元として残されている

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
- 対象 Secrets Manager の `GetSecretValue` 権限（将来の SDK fetch 移行時 / 監査時の備えとして付与しておく）

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

