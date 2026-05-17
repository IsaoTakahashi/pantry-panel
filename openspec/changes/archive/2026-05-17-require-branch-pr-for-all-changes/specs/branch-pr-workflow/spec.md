## ADDED Requirements

### Requirement: All changes go through branch and PR
ドキュメント変更を含むプロジェクトへのすべての変更は、ブランチを切り、PR を通じて main にマージしなければならない（SHALL）。main への直接 push は原則禁止とする。

#### Scenario: Documentation change
- **WHEN** 開発者がドキュメント（`general.md` 等）を変更する
- **THEN** ブランチを作成し、PR を経由して main にマージする

#### Scenario: Feature or bugfix change
- **WHEN** 開発者がコードを変更する
- **THEN** ブランチを作成し、PR を経由して main にマージする

#### Scenario: Branch naming
- **WHEN** ブランチを作成する
- **THEN** `{issue番号}-{概要}` の形式のブランチ名を使用する（例: `4-stock-item-crud`）
