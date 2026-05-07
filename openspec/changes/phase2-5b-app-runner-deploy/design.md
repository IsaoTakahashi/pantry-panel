## Context

Phase 2.5a で Supabase 上に DB が立ち上がっている。Backend をローカル稼働で本番 DB に接続できる状態だが、Frontend からは到達できない（localhost のみ）。Phase 2.5b では Backend を AWS App Runner にデプロイし、`*.awsapprunner.com` の HTTPS エンドポイントとして公開する。Phase 3 で WebSocket を本番検証するため、常時稼働 + WebSocket 対応のホスティングが必要で、App Runner は両条件を満たす。

## Goals / Non-Goals

**Goals:**
- Backend のコンテナイメージが ECR に存在する
- App Runner サービスが ECR イメージから稼働している
- 外部 HTTPS リクエストで `/health` と CRUD API が応答する
- App Runner の環境変数で DATABASE_URL / PORT / CORS が切り替えられる

**Non-Goals:**
- 自動デプロイ（Phase 2.5d）
- Frontend のデプロイ（Phase 2.5c）
- カスタムドメイン（標準ドメインで開始）
- IaC 化（Terraform / CDK）— 初回は手動、運用が安定してから検討
- Blue/Green デプロイ・カナリアリリース — App Runner 標準のローリング更新で十分
- 監視・アラート（CloudWatch アラーム等）— 別 change で扱う

## Decisions

### コンテナ配信モード: ECR + App Runner（GitHub Source 不採用）

ECR に push 済みのイメージを App Runner が pull して稼働する構成。

- **採用理由**:
  - イメージタグで明示的にバージョン管理ができる
  - GH Actions 側でビルド時間が見えて、CI とデプロイの責務が分離する
  - rollback はタグ指定で即可能
- **代替案**: App Runner GitHub Source モード → コードを push するだけで App Runner がビルド & デプロイ。手軽だが、ビルドの可観測性が下がり、private modules を扱うときに苦戦する

### Dockerfile: multi-stage + scratch ベース or alpine

Builder stage で `go build -ldflags="-s -w"` した static binary を、最終 stage の `scratch` または `alpine:3` にコピーする。

- **採用理由**:
  - イメージサイズが小さい（数十 MB 以下）→ ECR 転送・App Runner 起動が早い
  - 攻撃面が小さい
- **alpine vs scratch**: 初回は `alpine:3` を採用。`tzdata` や `ca-certificates`（HTTPS 通信に必要）が同梱され、デバッグも `sh` で入れる。`scratch` は将来検討。

### PORT 環境変数

`backend/main.go` で `PORT` を読み、未設定なら `8080` を使う。

- **採用理由**: App Runner は環境変数 `PORT` を渡してくれる前提（多くの PaaS の慣習）。コード側で対応するのが標準パターン。
- **代替案**: ハードコード 8080 のまま → App Runner 設定でポート 8080 を指定すれば動くが、PaaS 移行時の柔軟性が下がる

### CORS: 環境変数駆動（カンマ区切り）

`CORS_ALLOWED_ORIGINS` を読み、`,` で split して `AllowOrigins` に渡す。未設定時は localhost:3000（開発用デフォルト）。

- **採用理由**:
  - 本番フロント URL は Phase 2.5c までは確定しないので、環境変数で後付けが必要
  - 複数 origin（preview deploy）対応がしやすい
- **代替案**:
  - `*` で全許可 → セキュリティ NG
  - ハードコード → Vercel preview URL に対応できない

### App Runner インスタンスサイズ: 0.25 vCPU / 0.5 GB

最小構成。

- **採用理由**: 個人 / 家族用途、トラフィックは1日数十リクエスト想定。最小構成で十分。コスト ~$5/月。
- **代替案**: 0.5 vCPU / 1 GB → 不要、コスト 2 倍。

### Auto-scaling: min=1, max=1（最小構成）

スケールアウトを有効化しない。

- **採用理由**:
  - Phase 3 で LISTEN/NOTIFY を扱う際、複数インスタンスだと NOTIFY が来た 1 インスタンスから他のインスタンスに pub/sub する仕組みが追加で必要になる
  - 個人運用ではスケールが必要にならない
  - Direct Connection はコネクション数が少ないので、複数インスタンスでコネクション枯渇のリスクがある
- **代替案**: max=2 以上 → Phase 3 で破綻する

### Health check: `/health` を使用

App Runner の health check path に `/health` を設定。間隔 10 秒、失敗 3 回でアンヘルシー（App Runner デフォルト）。

- **採用理由**: 既存の `/health` エンドポイントが DB ping を含むため、DB 切断にも気づける。

## Risks / Trade-offs

- **App Runner はゼロスケールできない（min=1 必須）** → 月 ~$5 のコストが必ず発生。許容範囲内。
- **ECR への手動 push が手間** → Phase 2.5d で GH Actions 自動化する。
- **環境変数に DATABASE_URL を平文で持つ** → AWS Secrets Manager 連携を将来導入。初回は App Runner の secret env で代替（コンソール上で一度だけ入力、表示されない）。
- **ap-northeast-1 でも latency 数十 ms 程度** → 個人利用では問題なし。
- **rollback はタグ指定 → 手順書化が必須** → README に手順を残す。

## Migration Plan

1. ローカルで Dockerfile を書き、`docker build && docker run` で動作確認
2. ECR リポジトリ作成（ユーザー、コンソールまたは AWS CLI）
3. ローカルから ECR に push（手動）
4. App Runner サービス作成（ユーザー、コンソール）
   - Source: ECR
   - Image: 手動 push したタグ
   - 環境変数: DATABASE_URL（Supabase）/ PORT=8080 / CORS_ALLOWED_ORIGINS=http://localhost:3000（暫定）
   - Health check: `/health`
5. デプロイ完了後、サービス URL を取得
6. ローカル Frontend で `NEXT_PUBLIC_API_URL=https://<runner-url>` に切り替えて動作確認
7. 確認 OK なら Phase 2.5c に進む

ロールバック: App Runner サービスを停止すれば課金停止。コードは branch なので merge しなければ影響なし。
