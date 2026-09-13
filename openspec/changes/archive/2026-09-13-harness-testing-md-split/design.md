## Context

`.claude/rules/testing.md` はfrontend/backendのファイルを触るときにロードされる rule ファイル。現在258行あり、うち約200行が「判断基準の更新ログ」という個別インシデントの時系列記録。規範部分（スコープ定義・判断ツリー・proposal.mdフォーマット）とログが同一ファイルに同居しているため、参照性が落ちている。

## Goals / Non-Goals

**Goals:**
- 規範（テストスコープ定義・判断ツリー・フォーマット）とログ（インシデント記録）を分離する
- ログ本体は自動ロードされない場所に移し、testing.md の読み込みコストを下げる
- 既存ログの内容は一切失わない（コピーではなく移設）

**Non-Goals:**
- ログの内容そのものの見直し・要約・削除は行わない（分離のみ）
- testing.md のテストスコープ定義・判断ツリー自体の内容変更は行わない

## Decisions

- **移動先を `specs/testing-decision-log.md` にする**（`.claude/rules/` 配下の新規ファイルではない）: `.claude/rules/` は `paths:` frontmatter を持たないファイルが毎回ロードされる仕組みのため、同じ配下に置くと結局「常時ロードされる別ファイル」になり分離の効果が薄れる。`specs/` は openspec のワークフローで既に「必要な時に参照する」場所として運用されているため、置き場所として一貫性がある
- **testing.md には1行の参照リンクのみ残す**: 「判断基準の更新ログ」節そのものを消さず、`specs/testing-decision-log.md を参照` という1行に置き換える。実装 sub-agent やユーザーがテスト設計時に過去の判断根拠を辿れるようにするため
- **`scenario-driven-test-design` capability の該当要件を MODIFIED として更新する**: 蓄積先が変わるのは spec-level requirement の変更にあたるため

## Risks / Trade-offs

- [リスク] ログの移設漏れ（一部エントリだけ移動してしまう）→ [対策] 移設前後で `grep -c "^### 20"` を元のtesting.mdと新しいspecs/testing-decision-log.mdに対して実行し、件数の合計が一致する（移設後のtesting.mdには0件）ことを確認する。件数を決め打ちで覚えない
- [リスク] 過去のproposal.mdやコミットメッセージが `testing.md の更新ログ` という文言で該当セクションを参照している可能性 → [対策] 実装時に `grep -r "testing.md" .claude openspec specs` でリンク切れの言及がないか確認する（過去のアーカイブ済みproposalは履歴として残すため変更不要、今後の参照のみ新パスを使う）
