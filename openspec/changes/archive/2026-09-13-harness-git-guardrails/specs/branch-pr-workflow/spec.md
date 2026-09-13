## ADDED Requirements

### Requirement: main への直接 commit を hook でブロックする
Claude Codeセッション内でのmainブランチへの直接commitは、`PreToolUse` hookによって機械的にブロックされなければならない（SHALL）。ブランチが`main`かつ実行コマンドが`git commit`を含む場合、hookはexit code 2で当該コマンドの実行を拒否する。

#### Scenario: mainブランチでのcommit試行
- **WHEN** Claude Codeがmainブランチ上で`git commit`コマンドを実行しようとする
- **THEN** hookがexit code 2でコマンドを拒否し、ブランチを切るよう促すメッセージが表示される

#### Scenario: featureブランチでのcommit
- **WHEN** Claude Codeがfeatureブランチ（`main`以外）上で`git commit`コマンドを実行しようとする
- **THEN** hookは何もせずコマンドの実行を許可する

#### Scenario: hookが判定不能な場合はfail-openする
- **WHEN** hookがコマンドの解析やブランチ名の取得に失敗する（jqのパースエラー、gitリポジトリ外での実行等）、または実行コマンドが`git commit`を含まない
- **THEN** hookはexit code 0でコマンドの実行を許可し、無関係な`Bash`コマンドをブロックしない

### Requirement: ブランチ名・Closes記載をCIでadvisoryチェックする
`.github/workflows/harness-check.yml` はPRイベントで動作し、ブランチ名が`{issue番号}-{概要}`形式（`^[0-9]+-[a-z0-9-]+$`）か、PR本文に`Closes #N`が含まれるかを検証しなければならない（SHALL）。違反があってもjob自体は成功として扱い、PRへの警告コメントのみ行う（advisory）。

#### Scenario: 命名規則に違反するブランチ
- **WHEN** PRのheadブランチ名が`{issue番号}-{概要}`形式に一致しない
- **THEN** `harness-check.yml`はPRに警告コメントを残すが、job自体はfailさせずマージをブロックしない

#### Scenario: Closes記載がないPR
- **WHEN** PR本文に`Closes #N`が含まれない
- **THEN** `harness-check.yml`はPRに警告コメントを残すが、job自体はfailさせずマージをブロックしない

### Requirement: 調査用の一時コミットは本線に乗せない
原因調査中に作成したデバッグ用の一時的な変更（例: `debug:`プレフィックスのコミット）は、原因特定後にまとめてコミットし、調査目的の一時コミットをそのままpushしてrevertする運用は避けなければならない（SHALL）。

#### Scenario: デバッグ調査中の変更
- **WHEN** バグの原因調査のためにログ追加等の一時的な変更を加える
- **THEN** 原因特定後、調査用の変更は元に戻すか本来の修正に統合し、`debug:`コミット→`revert`コミットのペアを本線の履歴に残さない
