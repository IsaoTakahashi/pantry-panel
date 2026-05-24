## Why

機能変更・追加の際にユーザーシナリオが要件定義に含まれておらず、E2Eテストの設計が実装後の後付けになりがちで、どのスコープのテストで何を検証するかの基準が暗黙知になっている。実装前にユーザーシナリオと全テストスコープの設計を行うワークフローを確立し、テスト判断基準をドキュメントとして蓄積できるようにする。

## What Changes

- **テスト戦略ドキュメント** `.claude/rules/testing.md` を新規作成する
  - Frontend (Unit / Integration) / E2E (Mock / Preview) / Backend (Unit / Integration) の全スコープ定義
  - スコープ選択の判断ツリー（ブラウザが必要か・外部APIが必要か）
  - proposal.md で使用するテスト設計のハイブリッドフォーマット（サマリテーブル + G/W/T）
  - レビューで確定した判断基準の更新ログ

- **開発フロー** `.claude/rules/general.md` の Step 2「テストケース設計」を具体化する
  - ユーザーシナリオ（日本語）の定義を明示
  - testing.md のフォーマットで設計することを明記
  - testing.md への参照追加

- **proposal.md の慣習**：「ユーザーシナリオとテスト設計」セクションを標準化する
  - サマリテーブル（シナリオ × 環境 × スコープ）
  - 各シナリオの G/W/T + スコープ別検証観点テーブル + E2E判定と理由
  - フロントエンド・バックエンド両方のシナリオを含む

- **opsx:archive の慣習**：アーカイブ時に以下を追加で行う
  - proposal.md のユーザーシナリオを関連 spec.md に昇格
  - レビューで確定した判断基準を testing.md に追記

## Capabilities

### New Capabilities

- `scenario-driven-test-design`: ユーザーシナリオを起点にしたテスト設計ワークフロー。proposal.md のシナリオ定義フォーマット、testing.md のスコープ選択基準、archive 時の spec 昇格手順を定義する

### Modified Capabilities

（なし）

## Impact

- `.claude/rules/testing.md`：新規作成
- `.claude/rules/general.md`：Step 2 の記述更新、testing.md への参照追加
- `openspec/specs/scenario-driven-test-design/spec.md`：新規作成
- 既存コード・API・DBへの変更なし（ワークフロー・ドキュメントのみ）
