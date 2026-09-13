## Why

`.claude/rules/general.md` の「設計・変更管理ワークフロー」表と「開発フロー」表は、「テスト設計 sub-agent」「実装 sub-agent」「コードレビュー sub-agent」への委譲を必須ルールとして明文化しているが、`.claude/agents/` は空であり実体がない。委譲のたびにClaude Codeが表の記述からプロンプトを都度組み立てる運用になっており、過去のfeedbackメモリ（`feedback_tdd_workflow`, `feedback_implementation_ownership`）にも委譲の取り違えが記録されている。また、brainstorming→opsx:propose→opsx:apply→opsx:archiveという開発フロー全体も表としてのみ存在し、Skillのdescription駆動の発火に乗っていない。

## What Changes

- `.claude/agents/` に3つのproject-scoped agent定義を新設する。いずれも既存のsuperpowersスキル（`test-driven-development` / `subagent-driven-development` / `requesting-code-review`等）の薄いラッパーとして設計し、project固有の差分（testing.mdのフォーマット・参照パス、opsx連携、CIチェックコマンド等）のみを追加する。ロジックの重複実装は行わない
  - `test-design`: proposal.mdの「ユーザーシナリオとテスト設計」セクションを作成する
  - `implementation`: tasks.mdを元にTDDで実装する
  - `diff-review`: 変更差分をレビューする（既存の`/code-review` skillとの名前衝突を避けるため`code-review`ではなく`diff-review`とする）
- `pantry-panel-workflow` というproject-scoped skillを新設し、brainstorming→opsx:propose→opsx:apply→opsx:archiveのフロー全体（上記3エージェントへの委譲ポイントを含む）をdescription駆動で発火できるようにする

## Capabilities

### New Capabilities
- `subagent-workflow-automation`: `.claude/agents/`のproject-scoped agent定義と`pantry-panel-workflow` skillによる、設計〜実装〜レビューの委譲フローの実体化を扱う

### Modified Capabilities

なし（既存のワークフロー要件自体は変えず、実行手段を明文化する）

## Impact

- `.claude/agents/test-design.md`（新規）
- `.claude/agents/implementation.md`（新規）
- `.claude/agents/diff-review.md`（新規）
- `.claude/skills/pantry-panel-workflow/SKILL.md`（新規）
- 前提: `harness-testing-md-split` が先行してマージされていること（test-design agentが参照する testing.md の新しいログ配置を前提にするため）
