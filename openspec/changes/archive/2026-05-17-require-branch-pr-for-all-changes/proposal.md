## Why

ドキュメント変更を含むすべての作業が直接 main に push される運用では、レビューなしで本番ルールが変わるリスクがある。ブランチ + PR を必須とすることで、変更の意図を残しながらレビューを通じた品質維持を実現する。

## What Changes

- `general.md` のブランチ運用ルールを更新し、「すべての変更（ドキュメント含む）はブランチを切り、PR 経由で main にマージする」を明記する
- 直接 main への push は禁止（原則）であることを明示する

## Capabilities

### New Capabilities

なし（新機能なし）

### Modified Capabilities

- `branch-pr-workflow`: 開発ワークフローのブランチ・PR 運用ルールを変更（ドキュメント変更を含む全変更に適用を拡大）

## Impact

- `.claude/rules/general.md` のブランチ・Issue・PR 運用セクション
- 開発者の作業フロー（ドキュメント修正時もブランチが必要になる）
