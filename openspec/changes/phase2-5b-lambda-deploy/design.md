## Context

Phase 2.5a で Supabase 上に DB が立ち上がっている。当初は AWS App Runner で Backend を常時稼働させる予定だったが、

1. **App Runner は 2026-04-30 で新規受付停止**
2. 移行先候補の **ECS Express Mode は最小構成でも月 ~\$30** で個人運用には高い
3. 新規アカウントは **Fargate vCPU クォータ 0** で初回ブロックされる

という障害が連続した。これを機に Phase 3 のリアルタイム同期戦略を見直し、**Supabase Realtime（frontend 直接購読）** に振ることで Backend の WebSocket 要件を撤廃。Backend を **ステートレス HTTP のみ** に絞ることで、より低コストなホスティングが選択可能になる。

候補として Lambda + LWA、Fly.io scale-to-zero、Cloud Run 等を比較し、**Free Tier で実質 \$0** + **既存 AWS 知識・資源（ECR / Secrets Manager / IAM）の流用** + **AWS 学習価値の継続** から **AWS Lambda + Lambda Web Adapter** を採用する。

## Goals / Non-Goals

**Goals:**
- Backend のコンテナイメージが ECR に存在する（既存）
- Lambda Function が ECR の image を実行している
- Function URL で外部から HTTPS でアクセスできる
- 環境変数（`PORT` / `CORS_ALLOWED_ORIGINS`）と Secret（`DATABASE_URL`）が正しく注入されている
- `/health` および CRUD API がコールドスタート 500ms 以内、ウォーム時 50ms 以内で応答する

**Non-Goals:**
- 自動デプロイ（Phase 2.5d）
- Frontend のデプロイ（Phase 2.5c）
- カスタムドメイン
- Provisioned Concurrency（コスト最小化を優先、必要なら別 change）
- API Gateway（Function URL で十分、API Gateway は使わない）
- Phase 3 の自前 WebSocket 実装の本番化（学習ログ化のみ）

## Decisions

### ホスティング: AWS Lambda + Lambda Web Adapter (container image)

LWA は Lambda の上で通常の HTTP server（Echo / Express / Flask 等）を動かすためのアダプタ。Lambda の入力イベントを HTTP リクエストに変換し、HTTP server に転送、レスポンスを Lambda レスポンスに変換する。

- **採用理由**:
  - 既存の Echo コードを **無改修** で動かせる
  - 既存 Dockerfile に **LWA レイヤ 1 行追加** だけで対応可
  - Free Tier で実質 \$0
  - 既存 AWS 資源（ECR / Secrets Manager / IAM）の流用
- **代替案**:
  - Fly.io scale-to-zero → \$0-2/月。シンプルだが新規アカウント必要、AWS 知識は付かない
  - Cloud Run → 同等機能だが GCP 新規アカウント必要
  - Native Lambda handler（aws-lambda-go）→ Echo を捨てて Lambda 専用ハンドラに書き直す必要があり、ローカル開発ワークフローが分裂する

### Function URL（API Gateway 不採用）

Lambda Function URL を直接公開エンドポイントとして使う。

- **採用理由**:
  - 設定がシンプル（コンソール 1 操作）
  - API Gateway 料金（Free Tier 1M req/月、その後 \$3.5/M）を回避
  - HTTPS / CORS / IAM 認証 のコア機能は内蔵
- **代替案**:
  - API Gateway → カスタムドメイン / WAF / レート制限が必要なら検討。今は不要

### コンテナイメージ: 既存 Dockerfile + LWA レイヤ追加

```dockerfile
# 既存 multi-stage build に追加で:
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
```

- **採用理由**: 既存 Dockerfile・既存 binary の挙動はそのまま、LWA が ECS 用のコンテナを Lambda 互換にしてくれる
- **代替案**: LWA を init-binary として ENTRYPOINT に組込む方式 → public ECR layer の方がシンプル

### Secrets: Lambda 環境変数で直接保持（KMS 暗号化、IAM 制限）

設計当初は「Secrets Manager の `secrets:valueFrom` 機構で注入」を想定したが、**Lambda は ECS と異なりこの機構を持たない**ことが判明した。Lambda の env vars は単純な文字列マップで、AWS が起動時に Secrets Manager から fetch する仕組みは存在しない。

選択肢:
- **A) Lambda 環境変数に接続文字列を直接保持（KMS 暗号化）**: Lambda の Environment.Variables は KMS で暗号化されて at rest 保存される。閲覧には IAM `lambda:GetFunctionConfiguration` 権限が必要。コード変更不要
- **B) アプリ側で AWS SDK を使い起動時に Secrets Manager から取得**: Backend に SDK 追加、`main()` で取得、`pgxpool` 渡し前に書換え。コード追加 30-50 行
- **C) AWS Parameters and Secrets Lambda Extension Layer**: HTTP `localhost:2773` 経由で取得。B と同等のコード変更必要、Layer 経由でキャッシュ機構あり

**採用: A**。理由:
- 個人 / 家族用の運用で、KMS 暗号化 + IAM 制限で十分な脅威モデル
- コード変更ゼロでデプロイできる
- Secrets Manager の secret は **将来の 2.5d (GH Actions deploy) の値供給元** として残す
- B / C は secret rotation や監査ログ整備が必要になった段階で別 change で再評価する

**Trade-off**:
- Lambda コンソール / IaC リソース定義に接続文字列が現れる
- ローテーションする際は Lambda 側 env を更新する手作業が必要

### IAM Role: Lambda execution role を新規作成

ECS で使った `ecsTaskExecutionRole` とは Trust Policy（Service Principal）が異なるため流用不可。新しく `pantry-panel-lambda-role` を作る。

権限:
- `AWSLambdaBasicExecutionRole`（CloudWatch Logs）
- ECR 読取（container image pull）
- Secrets Manager 読取（対象 secret ARN のみ）

### 環境変数の設計

| 名前 | 値 | 由来 |
|------|----|------|
| `PORT` | `8080` | LWA のデフォルトポート |
| `AWS_LWA_PORT` | `8080` | LWA への明示指定（PORT と同値） |
| `AWS_LWA_READINESS_CHECK_PATH` | `/health` | LWA がコンテナ起動完了を判定するパス |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Phase 2.5c で Vercel URL を追加 |
| `DATABASE_URL` | Supabase 接続文字列（直接） | Phase 2.5a で控えた値 (`?sslmode=require` 込み)。Lambda KMS で暗号化保存 |

### Memory / Timeout

- Memory: **512 MB**（最小構成、Lambda は CPU が memory に比例するので、起動時間と DB 接続を許容するレベル）
- Timeout: **30 秒**（Function URL のデフォルト最大値）

ベンチして必要なら調整。

### Auto-scaling: Lambda 自動

Lambda は同時実行数の自動スケーリング。Phase 3 で WebSocket を扱わないので並列に複数インスタンス起動しても問題なし。

- AWS Account 単位の同時実行数 limit は Lambda のデフォルト 1000（個人運用には過剰）

### コールドスタート対策: 何もしない

家族 4 人の利用パターンでは 1 日数回 cold start にあたる程度。300-500ms の遅延は許容範囲。気になりだしたら EventBridge で 5 分間隔の `/health` ping を後付け（Free Tier 内）。

## Risks / Trade-offs

- **コールドスタート時の遅延（300-500ms）** → 個人 / 家族用途で許容範囲
- **Lambda 実行時間 15 分制限** → REST API は数秒で終わるため問題なし
- **DB コネクションプールが Lambda invocation ごとに張り直される可能性** → pgxpool は invocation 内で持続、ウォーム期間中は再利用される。コールドスタート時のみ pool 初期化コスト発生（数十 ms）
- **LWA は AWS 純正でなくサードパーティ（awslabs）** → 公式ブログ・サンプルでは推奨されており、安定稼働実績あり
- **Function URL の認可なし** → 公開 API として晒される。Backend の Echo CORS middleware で origin 制限、本番ユーザーは家族のみだがリクエスト過多対策は別 change で（CloudFront + WAF 等）
- **`lambda:InvokeFunction` の Principal `*` 許可** → AuthType=NONE の Function URL 動作には `lambda:InvokeFunctionUrl` だけでは不十分で、`lambda:InvokeFunction` 双方の付与が AWS により要求される。**任意の AWS アカウントから `aws lambda invoke` で本関数が叩ける状態** で過剰権限。Free Tier 浪費・情報露出のリスクあり。Phase 2.5d 以降 / 別 change で IP 制限 / Source ARN 条件 / API Gateway 経由化 などで締める TODO。
- **Supabase Direct Connection（IPv6 only）が Lambda から不可** → Lambda VPC 設定なしの場合 IPv6 outbound 非対応。**Supavisor Session Pooler**（IPv4 対応）に切替え。本番運用では Phase 3 の LISTEN/NOTIFY も Phase 3.5 への振替えで不要となるため Pooler で支障なし。

## Connection 方式の決定

| 環境 | 接続方法 | 理由 |
|------|---------|------|
| ローカル開発 | Direct or Pooler | Mac の IPv4/IPv6 自動選択、どちらでも動作する |
| Lambda（本番） | **Supavisor Session Pooler** | IPv6 非対応 / IPv4 ホストが必要 |

ホスト形式: `aws-*-<region>.pooler.supabase.com:5432`（実際の `aws-0-` / `aws-1-` の選択は Supabase Dashboard で確認、ロードバランス）

## Function URL の CORS

Function URL の `--cors` を空 (`{}`) にし、CORS の制御は **Backend の Echo CORS middleware に一本化**。理由:
- Function URL CORS と Echo CORS が同時に活きると、`Access-Control-Allow-Origin` 等のヘッダが二重に付与され、ブラウザが拒否
- 既に Echo は `CORS_ALLOWED_ORIGINS` 環境変数で動的制御できる
- Function URL に CORS 設定を入れる必然性はない

## Migration Plan

1. ✅ Backend Dockerfile を multi-stage で作成（Phase 2.5b 元プランで既に完了）
2. ✅ `backend/main.go` を PORT / CORS env 駆動化（既に完了）
3. Backend Dockerfile に LWA レイヤを追加（PR で実装）
4. ローカルで `docker build && docker run` で挙動確認（LWA は AWS 環境でのみ動作するため、起動だけ確認）
5. ECR に `linux/amd64` で push（既に push 済の image を上書き or 新タグ）
6. Lambda Function 作成（コンソール / CLI、ユーザー作業）
7. Function URL 有効化（ユーザー作業）
8. Secrets Manager 値を Lambda extension で注入する設定
9. ローカル Frontend を `NEXT_PUBLIC_API_URL=https://<function-url>` で動作確認
10. 確認 OK なら Phase 2.5c に進む

ロールバック:
- 失敗時は Lambda Function を削除（コスト 0 に戻る）
- ECR / Secrets Manager / IAM Role は残しても課金影響なし

## Open Questions

実装中に AWS docs / CLI で確認しつつ決定:

- LWA の最新バージョンタグ（`public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1` か、より新しいか）
- Lambda + Secrets Manager Extension の **正確な環境変数名**（`AWS_SECRETS_MANAGER_SECRET_ARNS` で本当に env 経由で値が取れるか、それとも extension の SSM 用 endpoint 経由で fetch 必要か）
- Function URL の Auth Type は `NONE`（公開）で初期構築、後で `AWS_IAM` に締めるかどうか
- Lambda の **container image アーキテクチャ**（`linux/amd64` で問題なし、ARM64 にする場合は別途検証）

## References

- [AWS Lambda Web Adapter - GitHub](https://github.com/awslabs/aws-lambda-web-adapter)
- [Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [Using Lambda with container images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)
- [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html)
