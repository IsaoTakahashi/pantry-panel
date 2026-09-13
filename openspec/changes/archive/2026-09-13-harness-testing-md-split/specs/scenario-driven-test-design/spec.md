## MODIFIED Requirements

### Requirement: レビューで確定した判断基準を testing.md に蓄積する
ユーザーがテスト設計をレビューし、スコープ変更（例: E2E → Integration）を承認した場合、その理由を `specs/testing-decision-log.md` の更新ログに追記しなければならない（SHALL）。`.claude/rules/testing.md` にはログ本体を置かず、`specs/testing-decision-log.md` への参照リンクのみを記載する。

#### Scenario: 判断基準がレビュー後に更新される
- **WHEN** ユーザーが「このシナリオは Integration で十分」と判断を下す
- **THEN** `specs/testing-decision-log.md` の更新ログに変更日・対象シナリオ・理由・追加された基準が追記される

#### Scenario: testing.md からログを参照できる
- **WHEN** Claude がテスト設計時に過去の判断根拠を確認する
- **THEN** `.claude/rules/testing.md` の参照リンクから `specs/testing-decision-log.md` を辿って過去の更新ログを閲覧できる
