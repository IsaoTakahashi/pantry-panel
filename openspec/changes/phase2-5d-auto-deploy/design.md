## Context

Phase 2.5a〜c が完了すると、本番アプリ一式（Supabase + App Runner + Vercel）が稼働している。Frontend は Vercel の GitHub 連携で main 自動デプロイ済みだが、Backend は手動 ECR push に頼っている状態。Phase 2.5d で Backend も main 自動デプロイにすることで、Phase 3 の WebSocket 実装に入る前に CI/CD の足並みを揃える。

## Goals / Non-Goals

**Goals:**
- main への push（merge）で Backend が自動デプロイされる
- AWS への認証は OIDC（短命トークン）を使用する
- デプロイ完了後の smoke test で `/health` 200 を必須にする
- 失敗時は GitHub Actions が赤くなり、人間が気づける

**Non-Goals:**
- preview deploy / staging 環境（main → 本番のみ）
- カナリア / Blue-Green 配信 — App Runner 標準のローリングのみ
- 自動 rollback（失敗検知時）— 別 change で扱う
- DB マイグレーションの自動実行（Phase 2.5a の方針通り当面手動）
- Slack / Discord 通知 — 必要なら別途追加

## Decisions

### AWS 認証: OIDC (GitHub OIDC Provider) を採用

GitHub Actions に AWS アクセスキーを Secrets として置かず、OIDC で短命トークンを取得して IAM Role を AssumeRole する。

- **採用理由**:
  - アクセスキー漏洩リスクなし
  - GitHub 公式推奨 (`aws-actions/configure-aws-credentials@v4`)
  - 監査がしやすい（CloudTrail に Web Identity が残る）
- **代替案**: アクセスキー + Secrets に保存 → 漏洩リスクあり、ローテーション手間あり

### Job 構成: build-and-push → deploy → smoke-test の 3 段直列

並列化せず直列にする。

- **採用理由**:
  - deploy は build 完了が前提
  - smoke-test は deploy が反映されてからでないと意味がない
  - 並列化のメリットが小さい（build 数十秒、deploy 数分）
- **代替案**: build と deploy を 1 step に集約 → 失敗時の切り分けがしづらい

### Image タグ戦略: `${{ github.sha }}` と `latest` の両方を付ける

- **採用理由**:
  - `latest` は人が「最新」を指定するときに便利
  - `${{ github.sha }}` で過去の任意のコミットを再デプロイ・rollback 可能
- **代替案**: `latest` のみ → rollback 困難
- **代替案**: SHA のみ → 人手のオペレーションが煩雑

### App Runner 反映方式: `aws apprunner start-deployment`

- **採用理由**:
  - App Runner は ECR の `latest` を指している場合 push を検知して自動デプロイする機能もあるが、明示的に StartDeployment を呼ぶことで GH Actions 上で完了待ちと smoke test ができる
  - aws CLI 標準コマンドで簡潔
- **代替案**: ECR push のみで自動更新を待つ → デプロイ完了タイミングが GH Actions から見えない

### Smoke test: `/health` のみ（最小）

curl で `/health` が 200 を返すまで最大 5 分間ポーリングする。

- **採用理由**: 起動失敗の早期検知のみ最小スコープで実現。深い E2E は別 workflow（既存 e2e.yml）で扱う。
- **代替案**: 主要 API（GET /api/stock-items）も叩く → 認証等で複雑化、初回は `/health` で十分

### ワークフローの trigger: `push: main` と `workflow_dispatch`

- **採用理由**:
  - main 自動 + 手動再実行（rollback 等）の 2 ルートを担保
- **代替案**: タグ push のみ → 個人運用には堅すぎる

## Risks / Trade-offs

- **OIDC 設定が初回は手間** → ユーザー側のステップが多い。手順書を README に固定する。
- **ECR `latest` 反映待ちで App Runner が古いイメージで稼働する瞬間** → StartDeployment を明示的に叩くため発生しない。
- **smoke test がタイムアウトすると false alarm** → 5 分の余裕、5 秒間隔のリトライで現実的にはほぼ起きない。起きたらロールバック手順を実行。
- **ECR ストレージ増加** → タグなし不要イメージは ECR Lifecycle Policy で自動削除（30 日 / 直近 10 個保持などの設定を別途）。今回はスコープ外、運用しながら判断。

## Migration Plan

1. AWS 側で GitHub OIDC Provider を作成（ユーザー、初回のみ）
2. IAM Role `pantry-panel-deploy-role` を作成（信頼ポリシーに GitHub OIDC、許可ポリシーに ECR push + App Runner StartDeployment）
3. GitHub リポジトリの Secrets / Variables に必要な値を登録
4. `.github/workflows/deploy-backend.yml` を PR で追加
5. PR を main にマージ → 初回ワークフローが走る
6. ワークフロー成功 + smoke test 成功を確認
7. 試しに backend の文言を 1 行変えて main に push → 自動デプロイされることを確認

ロールバック:
- 失敗デプロイ時: App Runner コンソールで前 successful deployment にロールバック、または `${{ github.sha }}` タグで `aws apprunner start-deployment --image-identifier <old-sha>` を手動実行
- ワークフロー自体に問題: `.github/workflows/deploy-backend.yml` を revert する PR を main にマージすれば、以降のデプロイは止まる（既存の本番は影響なし）

## Open Questions

- ECR Lifecycle Policy の閾値（保持数 / 日数）— 別 change で詰める
- デプロイ通知（Slack 等）— 必要に応じて Phase 3 以降で追加
