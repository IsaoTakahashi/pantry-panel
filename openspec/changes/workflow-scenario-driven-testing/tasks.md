## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "開発ワークフロー改善: ユーザーシナリオ駆動のテスト設計"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [ ] 1.3 Draft PR を作成する

## 2. testing.md の作成

- [x] 2.1 `.claude/rules/testing.md` を新規作成する（テストスコープ定義・スコープ選択基準・テスト設計フォーマット・判断基準更新ログの構造）
- [x] 2.2 6スコープの定義を記載する（Frontend Unit/Integration、E2E Mock/Preview、Backend Unit/Integration）
- [x] 2.3 スコープ選択の判断ツリーを記載する（ブラウザ必要？→E2E / 外部API必要？→Preview）
- [x] 2.4 ハイブリッドフォーマットのテンプレートと記入例を記載する（サマリテーブル + G/W/T + スコープ別検証観点）
- [x] 2.5 判断基準の更新ログセクションを追加する（日付・理由・基準の追記形式）

## 3. general.md の更新

- [x] 3.1 `.claude/rules/general.md` の Step 2「テストケース設計」をユーザーシナリオ定義 + ハイブリッドE2Eテスト設計に具体化する
- [x] 3.2 testing.md への参照リンクを追加する
- [x] 3.3 archive 時の追加手順（シナリオの spec.md 昇格・testing.md 更新）を開発フローに明記する

## 4. 動作確認・仕上げ

- [ ] 4.1 PR を ready for review にして、Issue を `Closes #N` でリンクする
