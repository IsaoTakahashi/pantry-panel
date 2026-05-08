## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Phase 2.5b: Backend を AWS App Runner にデプロイ"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [x] 1.3 Draft PR を作成する

## 2. Backend のコード対応

- [x] 2.1 `backend/main.go` の `e.Start(":8080")` を `os.Getenv("PORT")` 駆動にする（未設定時 8080）
- [x] 2.2 `backend/main.go` の `AllowOrigins` を `CORS_ALLOWED_ORIGINS`（カンマ区切り、未設定時 `http://localhost:3000`）駆動にする
- [x] 2.3 既存の Go ユニットテストが通ることを確認する
- [x] 2.4 `backend/main.go` の env 解析部分に必要に応じてユニットテストを追加する（`strings.Split` の空文字ハンドリング等）

## 3. Dockerfile / .dockerignore 作成

- [x] 3.1 `backend/Dockerfile`（multi-stage、builder: golang:1.26-alpine、final: alpine:3、static binary）を作成する
- [x] 3.2 `backend/.dockerignore` を作成する（go test artifacts、`.git`、`.serena`、テストデータ等を除外）
- [x] 3.3 `docker build -t pantry-panel-backend:local backend/` でビルド成功することを確認する
- [x] 3.4 ローカル Postgres に接続して `docker run -p 8080:8080 -e DATABASE_URL=...` で起動し `/health` が 200 を返すことを確認する

## 4. AWS ECR 作成と push（ユーザー作業）

- [ ] 4.1 AWS ECR で `pantry-panel-backend` リポジトリを `ap-northeast-1` に作成する
- [ ] 4.2 ECR ログイン（`aws ecr get-login-password ... | docker login ...`）
- [ ] 4.3 イメージにタグを付けて push する（タグ: `v0.1.0` と `latest`）
- [ ] 4.4 ECR コンソールで push されたイメージを確認する

## 5. AWS App Runner サービス作成（ユーザー作業）

- [ ] 5.1 App Runner で新規サービスを作成する（Source: ECR、Image: `pantry-panel-backend:latest`、Region: `ap-northeast-1`）
- [ ] 5.2 インスタンス: 0.25 vCPU / 0.5 GB、Auto scaling: min=1 max=1 を設定する
- [ ] 5.3 環境変数を設定する:
  - `DATABASE_URL`（Phase 2.5a の Supabase Direct Connection 文字列、`sslmode=require` 込み、**Secret として登録**）
  - `PORT`: `8080`
  - `CORS_ALLOWED_ORIGINS`: `http://localhost:3000`（Vercel デプロイ後 2.5c で更新）
- [ ] 5.4 Health check: HTTP `/health`、Interval 10s、Timeout 5s
- [ ] 5.5 サービス作成 → 稼働開始まで待つ（数分）
- [ ] 5.6 サービス URL（`*.awsapprunner.com`）を控える

## 6. 動作確認

- [ ] 6.1 `curl https://<service-url>/health` が 200 を返すことを確認する
- [ ] 6.2 ローカル Frontend を `NEXT_PUBLIC_API_URL=https://<service-url>` で起動し、商品 CRUD と wantToBuy トグルが動作することを確認する
- [ ] 6.3 Supabase SQL Editor で実データが書き込まれていることを確認する
- [ ] 6.4 App Runner ログで リクエストが処理されていることを確認する

## 7. ドキュメント更新

- [ ] 7.1 `README.md` または `.claude/rules/backend.md` に ECR push 手順と App Runner 設定手順をまとめる
- [ ] 7.2 ロールバック手順（ECR の旧タグへ App Runner Image URI を変更）を記載する
- [ ] 7.3 `specs/features.md` の Phase 2.5 セクションを更新する

## 8. 仕上げ

- [ ] 8.1 CI（lint + tsc + vitest + go test）がすべてパスすることを確認する
- [ ] 8.2 PR を ready for review にして、Issue を `Closes #N` でリンクする
- [ ] 8.3 マージ後に `openspec archive phase2-5b-app-runner-deploy` で archive する
