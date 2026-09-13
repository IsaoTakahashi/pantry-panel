## Why

`.claude/rules/testing.md`（`paths: frontend/**, backend/**` でスコープ）は258行のうち約200行が「判断基準の更新ログ」という個別インシデントの時系列記録（2026-05-26〜09-11、`### YYYY-MM-DD:` 見出し12件。うち1件は `### 記載上の注意` 直下に混入している）になっている。規範（テストスコープ定義・判断ツリー・proposal.mdフォーマット）とログが同一ファイルに混在しており、次にテスト設計を行う際に判断基準を素早く参照する目的から外れつつある。Claude Codeの公式プラクティスでも「矛盾・陳腐化した記述は定期的に分離・整理する」ことが推奨されている。

## What Changes

- `.claude/rules/testing.md` から「判断基準の更新ログ」セクション（`### 記載上の注意` 直下に混入している1件を含む、全12件のインシデント記録）を `specs/testing-decision-log.md`（自動ロードされない場所）に移動する
- `testing.md` には移動先への1行の参照リンクのみを残す
- `scenario-driven-test-design` capability の「レビューで確定した判断基準を testing.md に蓄積する」要件を、「`specs/testing-decision-log.md` に蓄積する」に変更する

## Capabilities

### New Capabilities

なし（新機能なし）

### Modified Capabilities

- `scenario-driven-test-design`: 判断基準の更新ログの蓄積先を `.claude/rules/testing.md` から `specs/testing-decision-log.md` に変更する

## Impact

- `.claude/rules/testing.md`（大幅に軽量化、規範のみ残る）
- `specs/testing-decision-log.md`（新規、既存ログ本体を移設）
- 後続の `harness-subagents-workflow-skill` 変更で新設する test-design agent は、この新しいファイル配置を前提に testing.md を参照する
