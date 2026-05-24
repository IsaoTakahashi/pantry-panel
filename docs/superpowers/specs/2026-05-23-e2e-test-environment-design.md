# E2E テスト環境設計

**日付**: 2026-05-23  
**対象**: Integration Test / E2E Test 環境整備

## 概要

2つの E2E テスト環境を整備する。

| シナリオ | 用途 | 外部 API | DB |
|---------|------|---------|-----|
| Scenario 1: Preview E2E | PR ごとに preview 環境をフル検証 | 本物（CSE・Claude） | 本番 Supabase |
| Scenario 2: Mock E2E | CI (PR) とローカルで高速フィードバック | page.route() でモック | 本番 Supabase（test group で分離） |

## アーキテクチャ

```
Scenario 1 (Preview E2E)                    Scenario 2 (Mock E2E)
─────────────────────────────────────        ──────────────────────────────────────────
trigger: deployment_status (Vercel)          trigger: PR CI（毎回）/ ローカル

  backend health check                         go run . (local backend)
  (PREVIEW_LAMBDA_FUNCTION_URL)                  DATABASE_URL = E2E_SUPABASE_DATABASE_URL
                                               npm run dev (local frontend)
  Playwright --project=preview
  baseURL = Vercel preview URL                 Playwright --project=mock
  backendURL = Lambda preview URL              baseURL = http://localhost:3000
                                               Supabase = 本番と同じプロジェクト
  Real Supabase（本番 DB）                     外部 API = page.route() でモック
  Auth = email/password test user              Auth = email/password test user
```

両シナリオとも **Playwright `projects`** で同一の `playwright.config.ts` から実行する。

## 認証セットアップ

### 仕組み

Playwright の `globalSetup` スクリプトで一度だけ Supabase に email/password でログインし、セッションを `.auth/user.json`（`storageState`）に保存する。各テストはその状態から開始する。

```
globalSetup.ts
  supabase.auth.signInWithPassword({ email, password })
  → JWT を localStorage + cookies に注入
  → storageState を .auth/user.json に保存

playwright.config.ts
  projects:
    - name: preview
      use: { storageState: '.auth/user.json', baseURL: process.env.PREVIEW_URL }
    - name: mock
      use: { storageState: '.auth/user.json', baseURL: 'http://localhost:3000' }
```

Google OAuth の UI は操作しない。

### 事前セットアップ（手作業・一回限り）

1. Supabase Dashboard で email/password 認証を有効化
2. テストユーザーを作成（例: `e2e-test@pantry-panel.dev`）
3. そのユーザーに group を 1 つ割り当てる
4. `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` を GitHub Secrets と `.env.local` に追加

### Scenario 2 のデータ分離

- `globalSetup` でテスト開始時に `test-{timestamp}` という名前の group を backend API 経由で作成
- 作成した group_id を `.auth/test-context.json` に書き出す
- 各テストは `test-context.json` を読んで group に属した状態（storageState に group_id を格納済み）で動作
- `globalTeardown` でその group と stock_items を削除
- 本番データとは group_id で完全分離（将来 Supabase プロジェクトを別に切り出す場合も環境変数の差し替えだけで対応可能）

## 外部 API モック戦略（Scenario 2）

### モック対象

| 外部 API | backend endpoint | モック方法 |
|---------|-----------------|-----------|
| Claude（URL 抽出） | `POST /api/extract-from-url` | `page.route()` でスタブレスポンス |
| Google CSE（画像検索） | `GET /api/image-search` | `page.route()` でスタブレスポンス |

### fixture による整理

既存テストが個別に書いていた `page.route(...)` を共通 fixture に集約する。

```
frontend/e2e/fixtures/mock-routes.ts
  mockExtractFromUrl(page, response)  // 成功・422・500 パターン
  mockImageSearch(page, images)       // 検索結果スタブ

frontend/e2e/fixtures/index.ts
  test = base.extend({ mockRoutes })  // カスタム fixture としてエクスポート
```

`preview` project では fixture を適用しない（本物の API を使う）。

## CI ワークフロー

### e2e-preview.yml（新規）

```yaml
on:
  deployment_status:
    # Vercel が preview deploy 成功を報告したとき発火
    # Production deploy（environment = "Production"）は除外

permissions:
  actions: read  # gh run list で他 workflow の状態確認に必要

jobs:
  e2e-preview:
    if: >
      github.event.deployment_status.state == 'success' &&
      github.event.deployment.environment != 'Production'
    steps:
      # 1. preview-backend.yml の完了を待つ（backend 変更がある PR のみ）
      #    同じ SHA に対して preview-backend.yml が走っているか確認する。
      #    - in_progress / queued → gh run watch で完了まで待機
      #    - success 済み         → そのまま通過
      #    - failure / cancelled  → このジョブも失敗
      #    - 存在しない           → backend 変更なし、health check のみ
      - name: Wait for preview-backend if running
        run: |
          sleep 15  # backend workflow が起動する猶予を与える
          ACTIVE=$(gh run list \
            --workflow=preview-backend.yml \
            --commit "${{ github.sha }}" \
            --json databaseId,status \
            --jq '.[] | select(.status=="in_progress" or .status=="queued" or .status=="waiting") | .databaseId' \
            | head -1)
          if [ -n "$ACTIVE" ]; then
            gh run watch "$ACTIVE" --exit-status
          else
            FAILED=$(gh run list \
              --workflow=preview-backend.yml \
              --commit "${{ github.sha }}" \
              --json conclusion \
              --jq '.[] | select(.conclusion=="failure" or .conclusion=="cancelled") | .conclusion' \
              | head -1)
            [ -n "$FAILED" ] && echo "preview-backend $FAILED" && exit 1
          fi

      # 2. backend health check（deploy 有無に関わらず常に実施）
      - backend health check（PREVIEW_LAMBDA_FUNCTION_URL/health）

      - npm ci && npx playwright install chromium
      - npx playwright test --project=preview
    env:
      PREVIEW_URL: ${{ github.event.deployment_status.environment_url }}
      PREVIEW_BACKEND_URL: ${{ vars.PREVIEW_LAMBDA_FUNCTION_URL }}
      E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
      E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
      E2E_SUPABASE_URL: ${{ secrets.E2E_SUPABASE_URL }}
      E2E_SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
```

### e2e.yml（既存を拡張）

```yaml
# trigger: pull_request（変更なし）

# 削除:
#   - services.postgres（backend は Supabase に接続するので不要）

# 追加:
#   - E2E_TEST_EMAIL / E2E_TEST_PASSWORD を Secrets から注入
#   - E2E_SUPABASE_DATABASE_URL を backend の DATABASE_URL として渡す
#   - npx playwright test --project=mock

# 削除（env vars）:
#   - hasSupabase ガード（globalSetup で auth が確立されるので不要）
#   - PLAYWRIGHT_SUPABASE_URL 等の旧変数（E2E_SUPABASE_URL に統一）
```

### GitHub Secrets 追加リスト

| Secret | 用途 |
|--------|------|
| `E2E_TEST_EMAIL` | テストユーザー email |
| `E2E_TEST_PASSWORD` | テストユーザー password |
| `E2E_SUPABASE_URL` | Supabase project URL |
| `E2E_SUPABASE_ANON_KEY` | Supabase anon key |
| `E2E_SUPABASE_DATABASE_URL` | Supabase Session Pooler URL（backend の DATABASE_URL） |

## ファイル変更一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `frontend/e2e/global-setup.ts` | 新規 | Supabase email/password ログイン → storageState 保存 |
| `frontend/e2e/global-teardown.ts` | 新規 | test group + データのクリーンアップ |
| `frontend/e2e/fixtures/mock-routes.ts` | 新規 | `mockExtractFromUrl` / `mockImageSearch` fixture |
| `frontend/e2e/fixtures/index.ts` | 新規 | カスタム test fixture のエクスポート |
| `frontend/playwright.config.ts` | 更新 | projects 定義、globalSetup/Teardown、storageState |
| `frontend/e2e/*.spec.ts` | 更新 | `page.route()` を fixture に移行、`hasSupabase` ガード削除 |
| `.github/workflows/e2e.yml` | 更新 | Secrets 注入、`--project=mock` 指定 |
| `.github/workflows/e2e-preview.yml` | 新規 | `deployment_status` トリガー、preview E2E |
| `frontend/.env.local` | 更新 | E2E 用の環境変数を追記（`.gitignore` 済み） |

## 将来の拡張

- Scenario 2 の DB を別 Supabase プロジェクトに切り出す場合は、`E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY` を差し替えるだけで対応可能
