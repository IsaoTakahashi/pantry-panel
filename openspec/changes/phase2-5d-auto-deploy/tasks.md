## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Phase 2.5d: Backend 自動デプロイ (GitHub Actions + OIDC)"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [x] 1.3 Draft PR を作成する

## 2. AWS 側の OIDC / IAM 設定（ユーザー作業）

- [ ] 2.1 AWS IAM で GitHub OIDC Provider を作成する（URL: `https://token.actions.githubusercontent.com`、Audience: `sts.amazonaws.com`）
- [ ] 2.2 IAM Role `pantry-panel-deploy-role` を作成する
  - 信頼ポリシー: GitHub OIDC を信頼、`repo:IsaoTakahashi/pantry-panel:ref:refs/heads/main` を `sub` 条件に
  - 許可ポリシー: 以下を最小権限で許可
    - `ecr:GetAuthorizationToken`
    - `ecr:BatchCheckLayerAvailability`、`ecr:PutImage`、`ecr:InitiateLayerUpload`、`ecr:UploadLayerPart`、`ecr:CompleteLayerUpload`、`ecr:BatchGetImage`（対象リポジトリのみ）
    - `lambda:UpdateFunctionCode`、`lambda:GetFunction`（対象 Function のみ）
- [ ] 2.3 Role ARN を控える

## 3. GitHub リポジトリの Variables 登録（ユーザー作業）

- [ ] 3.1 GitHub Repository → Settings → Secrets and variables → Actions → Variables
- [ ] 3.2 Variables に以下を登録:
  - `AWS_REGION`: `ap-northeast-1`
  - `AWS_ROLE_ARN`: 2.3 で控えた Role ARN
  - `ECR_REPOSITORY`: `pantry-panel-backend`
  - `LAMBDA_FUNCTION_NAME`: `pantry-panel-backend`
  - `LAMBDA_FUNCTION_URL`: `https://4xdn54pecs7z4hepmt2xcovq7m0nizno.lambda-url.ap-northeast-1.on.aws`（smoke test 用）

## 4. ワークフロー作成

- [ ] 4.1 `.github/workflows/deploy-backend.yml` を作成する
  - Trigger: `push` to `main`、`workflow_dispatch`
  - Permissions: `id-token: write`、`contents: read`
  - Job 1 `build-and-push`:
    - `aws-actions/configure-aws-credentials@v4` で OIDC 認証
    - `aws-actions/amazon-ecr-login@v2` で ECR ログイン
    - `docker buildx build --platform linux/amd64 --provenance=false --push -t $ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }} -t $ECR_REGISTRY/$ECR_REPOSITORY:latest backend/`（buildx + push 一発）
  - Job 2 `deploy` (needs: build-and-push):
    - 同じく OIDC 認証
    - `aws lambda update-function-code --function-name $FN --image-uri $ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }}`
    - `aws lambda wait function-updated --function-name $FN`（または get-function ポーリング）
  - Job 3 `smoke-test` (needs: deploy):
    - `curl -fsS --retry 30 --retry-delay 5 ${{ vars.LAMBDA_FUNCTION_URL }}/health`
- [ ] 4.2 ワークフロー YAML の lint（`actionlint` 推奨、無ければ手動目視）
- [ ] 4.3 PR を main にマージする前に「main 限定で走る」「PR では走らない」設定を再確認

## 5. 動作確認

- [ ] 5.1 PR をマージする → ワークフローが走る
- [ ] 5.2 build-and-push、deploy、smoke-test が全て緑になることを確認する
- [ ] 5.3 ECR コンソールで新しい sha タグと latest タグの両方が反映されたことを確認する
- [ ] 5.4 Lambda コンソールで Image URI が新しい sha に更新されたことを確認する
- [ ] 5.5 試しに `backend/` 配下の任意の文言を1行変えて PR → main マージ → 自動デプロイ完走を確認する
- [ ] 5.6 GitHub Actions UI から `workflow_dispatch` で手動再実行できることを確認する

## 6. ドキュメント更新

- [ ] 6.1 `README.md` にデプロイフロー（main → ECR → Lambda → smoke test）と rollback 手順（旧 sha タグで `aws lambda update-function-code` 手動実行）を記載する
- [ ] 6.2 `.claude/rules/general.md` の CI セクションに `deploy-backend.yml` の存在を追記する
- [ ] 6.3 `.claude/rules/backend.md` の deploy セクションを自動デプロイ前提に更新
- [ ] 6.4 `specs/features.md` の Phase 2.5 を完了マーク

## 7. 仕上げ

- [ ] 7.1 CI（lint + tsc + vitest + go test）がすべてパスすることを確認する
- [ ] 7.2 PR を ready for review にして、Issue を `Closes #N` でリンクする
- [ ] 7.3 マージ後に `openspec archive phase2-5d-auto-deploy` で archive する
