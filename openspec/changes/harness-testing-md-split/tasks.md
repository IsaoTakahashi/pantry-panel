## 1. ログファイルの新設

- [x] 1.1 `specs/testing-decision-log.md` を新規作成し、冒頭に「`.claude/rules/testing.md` の判断基準の更新ログ本体。テスト設計時の参照はこちらを見る」旨の説明を書く
- [x] 1.2 移設対象のエントリ数を決め打ちせず、`grep -c "^### 20" .claude/rules/testing.md` で実際の件数を数えてから着手する（`### 記載上の注意` 直下に混入している1件を含む、`## 判断基準の更新ログ` セクション外のエントリも対象）。全エントリを日付順を保ったまま `specs/testing-decision-log.md` にそのまま（要約・改変せず）移設する（実測12件。`### 記載上の注意` 直下の混入エントリは commit 履歴で日付が確定した位置＝最後から2番目に挿入）
- [x] 1.3 移設後、`grep -c "^### 20" .claude/rules/testing.md` が0件になり、`grep -c "^### 20" specs/testing-decision-log.md` が移設前の件数と一致することを確認する（0件 / 12件、一致）

## 2. testing.md の軽量化

- [x] 2.1 `testing.md` の `## 判断基準の更新ログ` セクションは、ログ追記フォーマットの説明（テンプレート）とともに残し、実体は `specs/testing-decision-log.md` を参照する旨の1行リンクに置き換える
- [x] 2.2 `### 記載上の注意` 直下にあった2026-09-11エントリを移設した後、`### 記載上の注意` セクションには本来の注意書き（シナリオ6件以上でe2e-design.mdに切り出す等）のみが残ることを確認する
- [x] 2.3 `testing.md` の残り行数を確認する（120行。proposal.md/design.mdの見積り「約60行前後」より多いが、258行中ログ本体は136行分のみで、残りは元々の規範部分＋テンプレートであり見積りが実測より少なかっただけ。規範部分の内容は変更前後で無改変）

## 3. 整合性チェック

- [x] 3.1 `grep -rn "testing.md" .claude openspec specs` で「判断基準の更新ログ」を参照している既存の記述（general.mdのワークフロー表、`.claude/rules/general.md` 内の「レビューで確定した判断基準を testing.md の更新ログに追記」等）がないか確認し、あれば `specs/testing-decision-log.md` を指すように更新する（アーカイブ済みproposal.mdは履歴のため変更しない）。general.md の該当2箇所（完了処理の表、Step 2詳細の箇条書き）を更新済み。それ以外の `testing.md` 参照（general.md 27/61/88行目、docs/superpowers配下の過去計画、openspec/specs/scenario-driven-test-design/spec.md）はフォーマット/スコープ定義の参照か、履歴/archive時対応（Task 3.3）のため変更不要
- [x] 3.2 `git diff --stat` で `testing.md` の削除行数と `specs/testing-decision-log.md` の追加行数が対応していることを目視確認する
- [ ] 3.3 `opsx:archive` 実行時に、`openspec/specs/scenario-driven-test-design/spec.md` の `## Purpose` 行（「review decisions are accumulated there」= testing.md を指す記述）を、ログの蓄積先が `specs/testing-decision-log.md` に変わったことを反映するよう更新する（archive時に実施。本タスクの実装スコープ外）
