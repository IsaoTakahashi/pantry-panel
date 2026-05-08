## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Phase 2.5b: Backend を AWS Lambda + LWA にデプロイ（方針再策定）"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [ ] 1.3 Draft PR を作成する

## 2. 旧 OpenSpec change の整理

- [x] 2.1 `openspec/changes/phase2-5b-app-runner-deploy/` を削除する
- [x] 2.2 `openspec/changes/phase2-5b-lambda-deploy/` を新規作成し、proposal / design / spec / tasks を書く

## 3. Backend のコード対応（既存内容を再適用）

- [x] 3.1 `backend/main.go` の PORT / CORS env 駆動化を再適用（旧 PR #48 の内容を再現）
- [x] 3.2 `backend/main_test.go` を再追加（旧 PR #48 の内容を再現）
- [x] 3.3 既存 Go テスト + 新テストが通ることを確認する

## 4. Dockerfile に Lambda Web Adapter レイヤを追加

- [x] 4.1 `backend/Dockerfile` の最終ステージに以下を追加する
  ```dockerfile
  COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
  ```
  （バージョンは [aws-lambda-web-adapter releases](https://github.com/awslabs/aws-lambda-web-adapter/releases) で最新の安定版を確認）
- [x] 4.2 `backend/.dockerignore` を再追加（旧 PR #48 の内容を再現）
- [x] 4.3 `docker build --platform linux/amd64 -t pantry-panel-backend:local backend/` でビルド成功することを確認する
- [x] 4.4 ローカルで `docker run -p 8080:8080 -e DATABASE_URL=... pantry-panel-backend:local` を起動し、LWA は使われずに直接 Echo が起動して `/health` が 200 を返すことを確認する

## 5. ECR への push（ユーザー作業）

- [x] 5.1 既存の `pantry-panel-backend` ECR リポジトリ（流用）にログイン
- [x] 5.2 イメージをタグ付けして push する（タグ: `lambda-v0.1.0` と `latest`、`--provenance=false` で Lambda 互換 manifest）
- [x] 5.3 ECR コンソールで push されたイメージを確認する

## 6. AWS リソース整理（ユーザー作業）

- [x] 6.1 `ecsInfrastructureRoleForExpressServices` を削除する（不要）
- [x] 6.2 `ecsTaskExecutionRole` を削除する（Lambda 用に新規作成するため）

## 7. Lambda execution role を新規作成（ユーザー作業）

- [x] 7.1 信頼ポリシーを作成（Lambda Service Principal）
- [x] 7.2 `pantry-panel-lambda-role` を作成し以下を設定:
  - `AWSLambdaBasicExecutionRole`（managed）をアタッチ
  - ECR の対象リポジトリへの `BatchGetImage` / `GetDownloadUrlForLayer` を許可するインラインポリシー
  - Secrets Manager の対象シークレットへの `GetSecretValue` を許可するインラインポリシー
- [x] 7.3 Role ARN を控える

## 8. Lambda Function 作成 + Function URL（ユーザー作業）

- [x] 8.1 `aws lambda create-function` で container image を指定して Function を作成する
  - `--package-type Image`
  - `--code ImageUri=<ECR-image-uri>`
  - `--role <lambda-role-arn>`
  - `--memory-size 512`
  - `--timeout 30`
  - `--architectures x86_64`
  - `--environment Variables="{PORT=8080,AWS_LWA_PORT=8080,AWS_LWA_READINESS_CHECK_PATH=/health,CORS_ALLOWED_ORIGINS=http://localhost:3000,DATABASE_URL=<supavisor pooler 接続文字列>}"`
  - DATABASE_URL は Lambda の KMS で暗号化保存される（ECS の `secrets:valueFrom` 相当の機構が Lambda には存在しないため、env で直接保持する）
  - **接続先は Supavisor Session Pooler**（`aws-*-<region>.pooler.supabase.com:5432`）。Direct Connection は IPv6 のため Lambda から接続不可
- [x] 8.2 Function URL を有効化する（`aws lambda create-function-url-config`）
  - `--auth-type NONE`
  - `--cors '{}'`（**空**。Function URL の CORS は無効化、Backend Echo の CORS_ALLOWED_ORIGINS に一本化）
- [x] 8.2.1 Function URL の resource policy に **`lambda:InvokeFunctionUrl` と `lambda:InvokeFunction` の両方** を Principal `*` に許可（AuthType=NONE 動作に AWS が要求する）
  - ⚠ `lambda:InvokeFunction` を `*` に開ける構成は過剰権限。Phase 2.5d 以降で IP 制限 / Source ARN / API Gateway 経由化 で締める TODO（Section 11.3）
- [x] 8.3 Function URL を控える（`https://<id>.lambda-url.ap-northeast-1.on.aws`）

## 9. 動作確認

- [x] 9.1 `curl -i https://<function-url>/health` が 200 + `{"db":"connected","status":"ok"}` を返すことを確認する
- [x] 9.2 ローカル Frontend を `NEXT_PUBLIC_API_BASE_URL=https://<function-url>` で起動し、商品 CRUD と wantToBuy トグルが動作することを確認する
- [x] 9.3 Supabase SQL Editor で実データが書き込まれていることを確認する（9.2 で UI 側に反映されたため実質確認済み）
- [x] 9.4 CloudWatch Logs (`/aws/lambda/pantry-panel-backend`) でリクエストが処理されていることを確認する
- [x] 9.5 コールドスタート時間（初回呼出から応答まで）を実測して 1 秒以下であることを確認する

## 10. ドキュメント更新

- [x] 10.1 `README.md` または `.claude/rules/backend.md` に Lambda + LWA 構成・Function URL 取得手順をまとめる
- [x] 10.2 ロールバック手順（`update-function-code` で旧タグへ戻す）を記載する
- [x] 10.3 `specs/features.md` の Phase 2.5 セクションを更新（2.5b ホスティングを Lambda + LWA に書き換え）
- [x] 10.4 `specs/features.md` の Phase 3 / 3.5 を再構成
  - Phase 3 の本番リアルタイム機構の記述を削除（Phase 3.5 に統合）
  - Phase 3 の自前 WebSocket 実装を「**学習目的のローカル / CI 動作確認のみ**」と明記
  - Phase 3.5 を「**本番のリアルタイム機構**」として明確化
- [x] 10.5 `.claude/rules/overview.md` のリアルタイム同期説明を 10.4 に合わせて更新

## 11. 仕上げ + フォローアップ TODO

- [ ] 11.1 CI（lint + tsc + vitest + go test）がすべてパスすることを確認する
- [ ] 11.2 PR を ready for review にして、Issue を `Closes #N` でリンクする
- [ ] 11.3 **(別 change で対応) `lambda:InvokeFunction` の `*` 許可を締める** — IP 制限 / Source ARN 条件 / API Gateway 経由化 / OAC（Origin Access Control）等を検討
- [ ] 11.4 **(別 change で対応) `production-database` capability を Pooler 採用に修正** — 現 main spec は Direct Connection 必須となっているが、本番では Pooler を使用する旨に書き換え
- [ ] 11.5 マージ後に `openspec archive phase2-5b-lambda-deploy` で archive する
