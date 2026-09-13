## Context

general.md は開発フローの各フェーズで「テスト設計 sub-agent」「実装 sub-agent」「コードレビュー sub-agent」への委譲を必須としているが、これらは表の中の呼称でしかなく、Claude Codeの`.claude/agents/`機構（project-scoped subagent定義）には乗っていない。一方でSuperpowersプラグインには`test-driven-development`, `subagent-driven-development`, `requesting-code-review`という汎用スキルが既に存在し、TDDやレビューの一般的な作法はカバー済み。今回の調査でも「重複機能を持つ肥大したツールセットを避ける」「凝ったマルチエージェント構成より単一エージェントのプロンプト改善が勝ることがある」という失敗事例が確認されている。

## Goals / Non-Goals

**Goals:**
- 3つの委譲ポイント（テスト設計・実装・コードレビュー）を実際に呼び出せる`.claude/agents/`定義として実体化する
- 各agent定義は「project固有の差分」のみを持ち、TDDやレビューの一般的な作法は既存のsuperpowersスキルに委ねる（薄いラッパー）
- brainstorming→opsx:propose→opsx:apply→opsx:archiveの全体フローをSkill化し、description駆動で発火しやすくする

**Non-Goals:**
- TDDの進め方（Red-Green-Refactor）やコードレビューの一般的な観点を新たに定義しない（`superpowers:test-driven-development` / `superpowers:requesting-code-review`が担う）
- 既存のgeneral.mdのワークフロー表の「要件」自体（どのフェーズで何をするか）を変更しない。実行手段を追加するだけ

## Decisions

- **agent定義は薄いラッパーにする**: 各`.claude/agents/*.md`のdescriptionには「いつ使うか」（例: test-designは「proposal.mdにユーザーシナリオとテスト設計セクションを書くとき」）を明記し、本文は (1) project固有のフォーマット・パスへの参照（testing.mdのハイブリッド形式、`specs/testing-decision-log.md`等）、(2) 対応するsuperpowersスキルを呼び出す指示、の2点のみに絞る。TDDの手順そのものは再実装しない
- **`pantry-panel-workflow` skillはgeneral.mdの表を「呼び出し可能な形」に変換したものとする**: 内容はgeneral.mdの「設計・変更管理ワークフロー」表と重複するが、これはSkillのdescriptionトリガーという別の発火経路を持たせるためであり、general.md側の表は「常時ロードされるルール」として、Skillは「関連する発言があったときに発火する実行ガイド」として役割を分ける。将来的にどちらかが更新されたらもう片方も同期する必要がある旨をSKILL.md内に明記する
- **命名は動名詞形にしない**: `test-design` / `implementation` / `diff-review`という名詞形にする。理由は、これらはgeneral.mdの表の呼称（「テスト設計 sub-agent」等）と対応させ、参照時の混乱を避けるため。Skillのベストプラクティス（動名詞形推奨）は主に汎用skillのためのものであり、project固有のagent名はproject用語との一貫性を優先する
- **コードレビュー担当agentは`code-review`ではなく`diff-review`と命名する**: 本プロジェクトには既に`/code-review`というSkillが存在しており、同名のagentを作ると呼び出し時にどちらが発火するか曖昧になる。役割（実装完了後の差分レビュー）を表す別名として`diff-review`を使う

## Risks / Trade-offs

- [リスク] agent定義とSkillとsuperpowersスキルの3層構造が複雑になり、かえって発火経路が分かりにくくなる → [対策] 各層の役割をSKILL.md冒頭とagent定義のdescriptionに明記する（general.mdは常時ルール、Skillは発火トリガー、agentは委譲先の実体、superpowersスキルは実行手順）
- [リスク] general.mdの表と`pantry-panel-workflow` skillの内容が将来乖離する → [対策] general.mdの「設計・変更管理ワークフロー」表の直後に「詳細な実行手順は `pantry-panel-workflow` skillを参照」という1行を追加し、表自体は概要のみに簡略化することを検討する（本design では実施せず、tasks.mdで既存の表をどこまで簡略化するかは実装時に判断する）
- [リスク] 3エージェントを一度に導入すると、実際の効果測定なしに複雑さだけが増える可能性がある（過去の失敗事例と同型） → [対策] 導入後、次の1〜2件の実装サイクルで実際に委譲が機能するか（description通りに発火するか）を確認し、機能しない場合はagent定義ではなくプロンプト改善で十分だった可能性を再検討する
