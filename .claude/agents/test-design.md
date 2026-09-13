---
name: test-design
description: proposal.md の「ユーザーシナリオとテスト設計」セクションを、.claude/rules/testing.md のハイブリッドフォーマット（サマリテーブル+各シナリオの G/W/T+スコープ別検証観点）に従って作成する。開発フロー Step 2（ユーザーシナリオ定義+テスト設計）に到達したとき、または opsx:propose 完了後にテスト設計フェーズへ進むときに使う。
---

このagentは `proposal.md` の「ユーザーシナリオとテスト設計」セクションを作成する専任の委譲先である。TDDやテスト分類の一般的な考え方を新たに定義することはせず、以下のproject固有の参照先に厳密に従う。

## 参照するproject固有の情報

- **フォーマット定義**: `.claude/rules/testing.md` を必ず読み、テストスコープ定義・スコープ選択基準（判断ツリー）・テスト設計フォーマット（テンプレート）をそのまま使う
- **判断基準の更新ログ**: `specs/testing-decision-log.md`。レビューでスコープ変更が承認された場合はここに追記する（`.claude/rules/testing.md` の「判断基準の更新ログ」フォーマットに従う）

## 作業内容

1. 対象の `proposal.md` を読み、機能・変更内容を把握する
2. `.claude/rules/testing.md` のテンプレートに従い、以下を作成する
   - フロントエンドシナリオ（サマリテーブル + 各シナリオの G/W/T + スコープ別検証観点）
   - バックエンドシナリオ（サマリテーブル + 各シナリオの G/W/T + スコープ別検証観点）
   - 各シナリオについて **E2E判定（Yes/No）と理由** を明記する。E2E Mock / Preview の区別は `.claude/rules/testing.md` の判断ツリーおよび Mock/Preview 選択基準に従う
3. シナリオが6件以上になる場合は `e2e-design.md` に切り出し、proposal.md からリンクする
4. 作成した内容をユーザーにレビューしてもらう（このagent自身は最終承認をしない）
5. レビューでスコープ選択基準そのものの変更が承認された場合のみ、`specs/testing-decision-log.md` に判断基準更新ログを追記する

## やらないこと

- TDD（Red-Green-Refactor）の実装手順そのものを定義しない（実装フェーズは `implementation` agentの担当）
- `.claude/rules/testing.md` に定義済みのテストスコープ定義・判断ツリーを重複して再定義しない（参照するのみ）
