# scenario-driven-test-design Specification

## Purpose
Define the workflow for scenario-driven test design: user scenarios are declared in proposal.md, test scope selection criteria are managed in testing.md, review decisions are accumulated there, and scenarios are promoted to spec.md at archive time.

## Requirements

### Requirement: ユーザーシナリオを proposal.md で定義する
機能変更・追加の proposal.md には「ユーザーシナリオとテスト設計」セクションを含めなければならない（SHALL）。このセクションはサマリテーブルと各シナリオの詳細（G/W/T + スコープ別検証観点）で構成される。

#### Scenario: 新規 proposal でシナリオが定義される
- **WHEN** `opsx:propose` で新しい change を作成する
- **THEN** proposal.md に「ユーザーシナリオとテスト設計」セクションが含まれ、シナリオ名・環境・スコープのサマリテーブルと各シナリオの G/W/T が記載されている

#### Scenario: バックエンドシナリオも含まれる
- **WHEN** 変更にバックエンドの API やDB操作が含まれる
- **THEN** proposal.md のシナリオセクションにバックエンドシナリオ（API契約レベルの G/W/T）も含まれている

---

### Requirement: テストスコープ選択基準を testing.md で管理する
`.claude/rules/testing.md` に全テストスコープの定義とスコープ選択の判断基準を記載しなければならない（SHALL）。

#### Scenario: スコープ選択の判断基準が参照できる
- **WHEN** Claude がシナリオのテスト設計を行う
- **THEN** testing.md の判断ツリー（ブラウザが必要か・外部APIが必要か）に従ってスコープと環境が決定され、E2E判定の理由が proposal.md に記載される

#### Scenario: Mock と Preview の環境が区別される
- **WHEN** E2E テストが必要と判断されたシナリオがある
- **THEN** 外部API（Google CSE / Supabase Realtime）が不要な場合は Mock、必要な場合は Preview と明示される

---

### Requirement: レビューで確定した判断基準を testing.md に蓄積する
ユーザーがテスト設計をレビューし、スコープ変更（例: E2E → Integration）を承認した場合、その理由を testing.md の更新ログに追記しなければならない（SHALL）。

#### Scenario: 判断基準がレビュー後に更新される
- **WHEN** ユーザーが「このシナリオは Integration で十分」と判断を下す
- **THEN** testing.md の更新ログに変更日・対象シナリオ・理由・追加された基準が追記される

---

### Requirement: archive 時にユーザーシナリオを spec.md へ昇格する
`opsx:archive` の実行時に、proposal.md のユーザーシナリオを関連する `openspec/specs/<capability>/spec.md` へ昇格させなければならない（SHALL）。

#### Scenario: シナリオが spec に昇格される
- **WHEN** `opsx:archive` を実行する
- **THEN** proposal.md のユーザーシナリオが対応する spec.md の「Scenarios」として追記・統合されている
