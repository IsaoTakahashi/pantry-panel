## ADDED Requirements

### Requirement: Scheduled warmup job runs periodically
GitHub Actions のスケジュールジョブが `/api/health` を定期的に叩き、Vercel 関数をウォーム状態に維持する SHALL。

#### Scenario: Scheduled job runs successfully
- **WHEN** スケジュール（10分間隔）でジョブが起動し、`/api/health` が 200 を返す
- **THEN** ジョブは成功（exit 0）で終了する

#### Scenario: Health endpoint returns non-2xx
- **WHEN** `/api/health` が 5xx を返す
- **THEN** ジョブは失敗（exit non-0）として記録される（アラートの起点になりうる）

### Requirement: App URL is configured via secret
ウォームアップ対象の URL はリポジトリの GitHub Secret `VERCEL_APP_URL` から取得する SHALL。URL をコードにハードコードしてはならない。

#### Scenario: Secret is set
- **WHEN** `VERCEL_APP_URL` が設定されていて、ジョブが起動する
- **THEN** そのURLに対してリクエストを送信する

#### Scenario: Secret is not set
- **WHEN** `VERCEL_APP_URL` が未設定でジョブが起動する
- **THEN** ジョブはエラーで終了し、URL 未設定である旨がログに残る
