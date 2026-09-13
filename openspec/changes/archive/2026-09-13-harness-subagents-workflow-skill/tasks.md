## 1. 前提確認

- [x] 1.1 `harness-testing-md-split` がマージ済みで、`specs/testing-decision-log.md` が存在し `.claude/rules/testing.md` が軽量化されていることを確認する

## 2. `.claude/agents/` の新設

- [x] 2.1 `.claude/agents/test-design.md` を作成する。frontmatter に `name: test-design`、`description`（「proposal.mdのユーザーシナリオとテスト設計セクションを作成するとき」を三人称で明記）を含める。本文はtesting.mdのハイブリッドフォーマットへの参照と、E2E判定理由の記載ルールのみ
- [x] 2.2 `.claude/agents/implementation.md` を作成する。frontmatter description は「tasks.mdのタスクをTDDで実装するとき」。本文は `superpowers:test-driven-development` を呼び出す指示と、commit毎push・CI確認ルールへの参照のみ
- [x] 2.3 `.claude/agents/diff-review.md` を作成する（既存の`/code-review` skillとの名前衝突を避けるため`diff-review`と命名）。frontmatter description は「実装完了後の変更差分をレビューするとき」。本文は `superpowers:requesting-code-review` を呼び出す指示のみ
- [x] 2.4 3つのagent定義がいずれも既存superpowersスキルの手順を再実装していないこと（重複がないこと）を確認する

## 3. `pantry-panel-workflow` skillの新設

- [x] 3.1 `.claude/skills/pantry-panel-workflow/SKILL.md` を作成する。frontmatterの`description`に「機能追加・修正依頼を受けたとき」を明記し、本文にbrainstorming→opsx:propose→(test-design agent)→opsx:apply→(implementation agent)→(diff-review agent)→opsx:archiveの順序と各ステップでの委譲先を記載する
- [x] 3.2 `.claude/rules/general.md` の「設計・変更管理ワークフロー」表の直後に、詳細な実行手順は `pantry-panel-workflow` skillを参照する旨の1行を追加する

## 4. 動作確認

- [x] 4.1 新しいセッションで `/agents` および Skill一覧を確認し、`test-design` / `implementation` / `diff-review` の3 agentと `pantry-panel-workflow` skillが一覧に表示され、frontmatterがエラーなくパースされていることを確認する(新セッションでの`/agents`一覧確認は本タスクの制約上実施不可のため、`yaml.safe_load`による静的パース確認で代替した。4ファイルとも`---`frontmatterがYAMLとして正しくパースできることを確認済み。なお`pantry-panel-workflow` skillは本セッション中に実際にSkillツールの利用可能一覧に自動表示されることを確認した)
- [x] 4.2 各agent・skillの`description`フィールドを読み、「何をするか」と「いつ使うか」の両方が三人称で明記されているかをチェックリストとして確認する（曖昧な説明が残っていないか）(4ファイルすべてで両方の要素を確認済み。詳細は実装報告を参照)
