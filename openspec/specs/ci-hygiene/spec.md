# ci-hygiene Specification

## Purpose
TBD - created by archiving change ci-improvements. Update Purpose after archive.
## Requirements
### Requirement: 全 workflow は最小権限の `permissions:` を明示する
`.github/workflows/` 配下の全 workflow ファイルは top-level に `permissions:` ブロックを MUST 持ち、ジョブが必要とする最小権限のみを許可する SHALL。

#### Scenario: ci.yml の permissions
- **WHEN** `.github/workflows/ci.yml` を確認する
- **THEN** workflow top-level に `permissions: { contents: read }` が記述されている

#### Scenario: e2e.yml の permissions
- **WHEN** `.github/workflows/e2e.yml` を確認する
- **THEN** workflow top-level に `permissions: { contents: read }` が記述されている

#### Scenario: keep-warm.yml の permissions
- **WHEN** `.github/workflows/keep-warm.yml` を確認する
- **THEN** workflow top-level に `permissions: {}` (空) が記述されている

#### Scenario: learning.yml の permissions
- **WHEN** `.github/workflows/learning.yml` を確認する
- **THEN** workflow top-level に `permissions: { contents: read }` が記述されている

### Requirement: PR トリガ workflow は concurrency で旧 run をキャンセルする
PR をトリガとする workflow (`ci.yml`, `e2e.yml`, `e2e-preview.yml`, `learning.yml`, `preview-backend.yml`) は top-level に `concurrency:` ブロックを MUST 持ち、同じ PR への新規 push で旧 run をキャンセルする SHALL。

#### Scenario: ci.yml の concurrency
- **WHEN** ci.yml を確認する
- **THEN** `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` が記述されている

#### Scenario: deploy-backend.yml には concurrency cancel を付けない
- **WHEN** deploy-backend.yml を確認する
- **THEN** `concurrency` ブロックが無い、または `cancel-in-progress: false` である (main の deploy を途中で止めないため)

### Requirement: ci.yml の backend job は Go module cache を有効化する
ci.yml の backend job は `actions/setup-go@v5` で `cache: true` を MUST 設定する。

#### Scenario: backend job の setup-go
- **WHEN** ci.yml の backend job の setup-go step を確認する
- **THEN** `with: { go-version-file: backend/go.mod, cache: true, cache-dependency-path: backend/go.sum }` が記述されている

### Requirement: ci.yml は paths-filter で不要な job をスキップする
ci.yml は `dorny/paths-filter@v3` を使う `changes` job を最初に持ち、後続の `frontend` / `backend` job は `if: needs.changes.outputs.<area> == 'true'` で起動判定する SHALL。workflow 自体の変更 (`.github/workflows/ci.yml`) の場合は両方が必ず走る MUST。

#### Scenario: frontend のみ変更された PR
- **WHEN** PR で `frontend/**` のみ変更されている
- **THEN** ci.yml は `frontend` job のみ実行し、`backend` job はスキップする
- **AND** ブランチ保護の required status check には skipped が success として扱われる

#### Scenario: workflow ファイル変更時は両方走る
- **WHEN** PR で `.github/workflows/ci.yml` を変更している
- **THEN** ci.yml は `frontend` job と `backend` job の両方を実行する

### Requirement: 依存自動更新は Dependabot で設定する
`.github/dependabot.yml` MUST 存在し、以下の ecosystem を weekly schedule で監視する SHALL: npm (frontend), gomod (backend), github-actions (root), docker (backend)。

#### Scenario: dependabot.yml の存在
- **WHEN** リポジトリを確認する
- **THEN** `.github/dependabot.yml` が存在する
- **AND** `updates:` に npm / gomod / github-actions / docker の 4 entry が含まれる
- **AND** 各 entry に `schedule: { interval: weekly }` と `open-pull-requests-limit: 5` が記述されている

#### Scenario: minor/patch はグルーピングする
- **WHEN** dependabot.yml の各 entry を確認する
- **THEN** `groups:` で minor + patch をまとめる設定が記述されている (major は個別 PR)

