## ADDED Requirements

### Requirement: Frontend は NEXT_PUBLIC_API_BASE_URL で API ベース URL を切り替える
Frontend は `NEXT_PUBLIC_API_BASE_URL` 環境変数を読み取り、すべての API 呼び出しのベース URL に使用する SHALL。未設定時は `http://localhost:8080` を使用する MUST。

#### Scenario: 環境変数指定で動作
- **WHEN** Frontend を `NEXT_PUBLIC_API_BASE_URL=https://example.awsapprunner.com` でビルド・起動する
- **THEN** すべての fetch リクエストの URL が `https://example.awsapprunner.com/...` で始まる

#### Scenario: 未設定時はローカル
- **WHEN** Frontend を `NEXT_PUBLIC_API_BASE_URL` 未設定で起動する
- **THEN** すべての fetch リクエストの URL が `http://localhost:8080/...` で始まる

### Requirement: Frontend は Vercel 上で公開される
Frontend は Vercel にホストされ、`*.vercel.app` の HTTPS URL で外部から到達可能 SHALL。

#### Scenario: 本番 URL に到達できる
- **WHEN** ブラウザで `https://<vercel-url>/stock-items` を開く
- **THEN** 商品一覧ページが表示される

#### Scenario: main へのマージで自動デプロイ
- **WHEN** GitHub の main ブランチに変更が push される
- **THEN** Vercel が自動でビルド・デプロイし、本番 URL が更新される

### Requirement: 本番 URL から Phase 1-2 の全機能が動作する
本番の Frontend (Vercel) と本番の Backend (App Runner) と本番の DB (Supabase) が連携して、Phase 1-2 の機能が全て SHALL 動作する。

#### Scenario: 商品 CRUD
- **WHEN** 本番 URL から商品を登録・編集・削除する
- **THEN** 操作が成功し、Supabase 側にも反映される

#### Scenario: wantToBuy トグル
- **WHEN** 本番 URL でカートアイコンをクリックする
- **THEN** トグルが切り替わり、Supabase に保存される

#### Scenario: フィルタ・シンプルビュー
- **WHEN** 本番 URL でフィルタ操作・表示モード切替を行う
- **THEN** Phase 2 / Phase 4 の挙動どおりに動作する

### Requirement: Vercel プロジェクトの Root Directory は `frontend/` に設定する
monorepo 構成のため、Vercel プロジェクト設定で Root Directory を `frontend/` に MUST 指定する。

#### Scenario: ビルドが frontend のみ対象
- **WHEN** Vercel のビルドログを確認する
- **THEN** `frontend/` 配下のみがビルド対象になっている（backend ファイルは無視）

## MODIFIED Requirements

### Requirement: Backend は CORS_ALLOWED_ORIGINS 環境変数で CORS 許可 origin を切り替える
Backend は `CORS_ALLOWED_ORIGINS`（カンマ区切り）を読み取り、Echo の CORS middleware の `AllowOrigins` に設定する SHALL。未設定時は `http://localhost:3000` を使用する MUST。本番環境では Vercel の本番 URL を MUST 含める。

#### Scenario: 単一 origin
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS=https://example.vercel.app` で起動する
- **THEN** `https://example.vercel.app` からのリクエストに `Access-Control-Allow-Origin: https://example.vercel.app` を返す

#### Scenario: 複数 origin
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS=https://a.vercel.app,https://b.vercel.app` で起動する
- **THEN** どちらの origin からのリクエストにも対応する CORS ヘッダを返す

#### Scenario: 未設定時はローカル用
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS` 未設定で起動する
- **THEN** `http://localhost:3000` のみ許可する

#### Scenario: 本番では Vercel URL を含む
- **WHEN** App Runner の `CORS_ALLOWED_ORIGINS` 環境変数を確認する
- **THEN** Vercel 本番 URL（例: `https://pantry-panel-xxxxx.vercel.app`）が含まれる
