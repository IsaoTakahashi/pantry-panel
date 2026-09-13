# subagent-workflow-automation Specification

## Purpose
`.claude/rules/general.md` が定義する設計・変更管理ワークフロー（brainstorming→opsx:propose→opsx:apply→opsx:archive）における各フェーズの委譲先を、`.claude/agents/`のproject-scoped agent定義と`pantry-panel-workflow` skillとして実体化する。agentは既存のsuperpowersスキルの薄いラッパーとし、TDDやレビューの一般的な手順は再実装しない。

## Requirements

### Requirement: test-design agentがユーザーシナリオとテスト設計を作成する
`.claude/agents/test-design.md` はproject-scoped agentとして存在しなければならない（SHALL）。このagentはproposal.mdの「ユーザーシナリオとテスト設計」セクションを、`.claude/rules/testing.md`のハイブリッドフォーマット（サマリテーブル+各シナリオのG/W/T+スコープ別検証観点）に従って作成する。

#### Scenario: テスト設計フェーズでの委譲
- **WHEN** 開発フローのStep 2（ユーザーシナリオ定義+テスト設計）に到達する
- **THEN** `test-design` agentに委譲され、testing.mdの判断ツリーに従ったスコープ選択とE2E判定理由がproposal.mdに記載される

### Requirement: implementation agentがTDDで実装する
`.claude/agents/implementation.md` はproject-scoped agentとして存在しなければならない（SHALL）。このagentはtasks.mdのタスクを元に、`superpowers:test-driven-development`に従ったRed-Green-Refactorで実装する。

#### Scenario: 実装フェーズでの委譲
- **WHEN** `opsx:apply`でtasks.mdのタスクを実装する
- **THEN** `implementation` agentに委譲され、commitのたびにpushしてPR上のCIが最新状態に保たれる

### Requirement: diff-review agentが変更差分をレビューする
`.claude/agents/diff-review.md` はproject-scoped agentとして存在しなければならない（SHALL）。既存の`/code-review` skillとの名前衝突を避けるため`code-review`ではなく`diff-review`と命名する。このagentは実装完了後の変更差分をレビューし、ユーザーが最終確認する前段としての指摘を行う。

#### Scenario: コードレビューフェーズでの委譲
- **WHEN** 実装が完了し、ユーザーレビュー前のコードレビューフェーズに到達する
- **THEN** `diff-review` agentに委譲され、レビュー結果がユーザーに提示される

### Requirement: pantry-panel-workflow skillが開発フロー全体を発火する
`.claude/skills/pantry-panel-workflow/SKILL.md` はproject-scoped skillとして存在しなければならない（SHALL）。descriptionには「いつ使うか」（機能追加・修正依頼を受けたとき）を明記し、brainstorming→opsx:propose→opsx:apply→opsx:archiveの各フェーズと、それぞれで委譲すべきagentへの対応を示す。

#### Scenario: 機能追加の発言でフローが発火する
- **WHEN** ユーザーが機能追加・修正を依頼する発言をする
- **THEN** `pantry-panel-workflow` skillが発火し、brainstorming→opsx:propose→（test-design agent）→opsx:apply→（implementation agent）→（diff-review agent）→opsx:archiveの順序が示される

### Requirement: agent定義は既存skillの薄いラッパーとする
`.claude/agents/`配下の各agent定義は、TDDやコードレビューの一般的な手順を再実装せず、対応する`superpowers`スキル（`test-driven-development`, `subagent-driven-development`, `requesting-code-review`）を呼び出す指示と、project固有の差分（testing.mdのパス・フォーマット、opsx連携）のみを含まなければならない（SHALL）。

#### Scenario: agent定義の内容確認
- **WHEN** `.claude/agents/implementation.md`の内容を確認する
- **THEN** Red-Green-Refactorの詳細手順は記載されておらず、`superpowers:test-driven-development`を呼び出す指示とproject固有の差分のみが記載されている
