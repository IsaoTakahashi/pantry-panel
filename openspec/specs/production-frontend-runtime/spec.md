# production-frontend-runtime Specification

## Purpose
TBD - created by archiving change phase2-5c-vercel-frontend-deploy. Update Purpose after archive.
## Requirements
### Requirement: Frontend は NEXT_PUBLIC_API_BASE_URL で API ベース URL を切り替える
Frontend は `NEXT_PUBLIC_API_BASE_URL` 環境変数を読み取り、すべての API 呼び出しのベース URL に使用する SHALL。未設定時は `http://localhost:8080` を使用する MUST。

#### Scenario: 環境変数指定で動作
- **WHEN** Frontend を `NEXT_PUBLIC_API_BASE_URL=https://example.lambda-url.ap-northeast-1.on.aws` でビルド・起動する
- **THEN** すべての fetch リクエストの URL が `https://example.lambda-url.ap-northeast-1.on.aws/...` で始まる

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
本番の Frontend (Vercel) と本番の Backend (Lambda) と本番の DB (Supabase) が連携して、Phase 1-2 の機能が全て SHALL 動作する。

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

