> **[WITHDRAWN 2026-05-28]** 本 proposal のうち「Lambda Function URL の resource policy から `lambda:InvokeFunction` を削除する」項目は **撤回** された。マージ後の手動 apply で削除したところ `/health` が 403 を返したため。LWA (Lambda Web Adapter) Lambda では `InvokeFunctionUrl` と `InvokeFunction` の **両方** の Allow が必要。詳細と訂正は Issue #163 / `.claude/rules/backend.md` 7項。CI/CD ハイジーン (cache, permissions, concurrency, dependabot, reusable workflow) の他の項目は採用済みで影響なし。

## Why

GitHub Actions の現状は action のバージョン管理と OIDC 認証は先進的で整備度が高いが、以下の運用上のハイジーンが不足している:

- **CI 時間の無駄**: ci.yml の backend job で Go module cache が無効になっており、毎回 module download が走る (毎回 30-60 秒の損失)。Docker buildx の layer cache も未活用。
- **GITHUB_TOKEN の過剰権限**: ci.yml / e2e.yml / learning.yml / keep-warm.yml に `permissions:` 明示がなく、デフォルトの広い権限で動作している (principle of least privilege 違反)。
- **依存自動更新の不在**: `dependabot.yml` / `renovate.json` が無いため、npm / Go / GitHub Actions の脆弱性アップデートが手動。
- **runner リソースの浪費**: `concurrency:` 設定が全 workflow で無いため、同じ PR への連続 push が並行実行される。
- **重複コード**: `deploy-backend.yml` と `preview-backend.yml` が ECR build/push・Lambda deploy・smoke test ロジックを重複所有しており、片方を直すと両方を同期させる手間がある。
- **過剰な IAM 権限**: Lambda Function URL の resource policy が `lambda:InvokeFunctionUrl` と `lambda:InvokeFunction` 両方を Principal `*` に許可しており、後者は不要 (backend.md の TODO で既知)。

これらは個別には小さいが、未対応のままだと「セキュリティアップデートの放置」「CI 実行時間の漸増」「リソース浪費」が積み上がる。今のうちに基盤を固める。

## What Changes

- `ci.yml` の backend job に `cache: true` を追加して Go module をキャッシュする
- 全 workflow (ci.yml / e2e.yml / e2e-preview.yml / deploy-backend.yml / preview-backend.yml / keep-warm.yml / learning.yml) に最小権限の `permissions:` を明示する
- `.github/dependabot.yml` を新規作成し npm / gomod / github-actions / docker の自動 PR を有効化する
- 全 PR トリガー workflow (ci.yml / e2e.yml / e2e-preview.yml / learning.yml) に `concurrency: cancel-in-progress: true` を追加する
- `ci.yml` の frontend job / backend job に paths-filter を追加し、変更がない側はスキップする
- `docker/build-push-action` に `cache-from: type=gha` / `cache-to: type=gha,mode=max` を追加する
- `deploy-backend.yml` と `preview-backend.yml` の共通ロジックを reusable workflow (`_deploy-backend.yml`) に抽出する
- Lambda Function URL の resource policy から `lambda:InvokeFunction` の Principal `*` 許可を削除する (`InvokeFunctionUrl` のみで public access は成立する)

## Capabilities

### New Capabilities
- `ci-hygiene`: ci.yml / e2e.yml / learning.yml など PR バリデーション系 workflow のキャッシュ・権限・concurrency・paths-filter・依存自動更新といった共通ハイジーン要件を扱う

### Modified Capabilities
- `auto-deploy-pipeline`: 既存スペックに以下を追加する
  - reusable workflow への分解 (deploy-backend / preview-backend が共通ロジックを `_deploy-backend.yml` 経由で呼び出す)
  - Docker layer cache (GHA) の利用
  - IAM resource policy の `lambda:InvokeFunction` 削除

## Impact

- **影響範囲**: `.github/workflows/*.yml` 全部, `.github/dependabot.yml` (新規), AWS Lambda の resource policy (Console / CLI で 1 操作)
- **コード行数**: 推定 100-150 行 (削除込み, 新規 dependabot.yml と reusable workflow 抽出を含む)
- **アプリケーションコード**: 変更なし (frontend / backend のソースは触らない)
- **互換性**: 既存の deploy/preview/ci の動作は変えない。OIDC の trust policy も変更しない (audience 強化は今回スコープ外)
- **dependabot 有効化**: 初回有効化で大量の PR が来る可能性があるため、archive 直前にユーザー確認の上で有効化する
- **IAM 変更の検証**: `lambda:InvokeFunction` 削除後、Function URL 経由のアクセスが引き続き 200 を返すことを smoke test で確認する
