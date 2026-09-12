## REMOVED Requirements

### Requirement: Scheduled warmup job runs periodically
**Reason**: The GitHub Actions workflow (`keep-warm.yml`) this requirement described was removed in Issue #273 / PR #274 — public-repo scheduled workflows were observed running every 2-4 hours instead of the configured 10-minute interval under GitHub Actions load-based throttling, making the job ineffective as a warmup mechanism.
**Migration**: Warmup delivery moved to an external cron-job.org scheduled ping. See the new "External scheduler pings the warmup endpoint" requirement below.

#### Scenario: Scheduled job runs successfully
- **WHEN** スケジュール（10分間隔）でジョブが起動し、`/api/health` が 200 を返す
- **THEN** ジョブは成功（exit 0）で終了する

#### Scenario: Health endpoint returns non-2xx
- **WHEN** `/api/health` が 5xx を返す
- **THEN** ジョブは失敗（exit non-0）として記録される（アラートの起点になりうる）

### Requirement: App URL is configured via secret
**Reason**: This requirement only made sense for the GitHub Actions workflow, which read the target URL from a GitHub Secret. cron-job.org is configured directly in its own dashboard and has no dependency on GitHub Secrets.
**Migration**: The warmup target URL is configured directly in the cron-job.org job, not via a GitHub Secret. `VERCEL_APP_URL` remains a GitHub Secret used elsewhere (e.g. E2E workflows) but is no longer part of the warmup mechanism.

#### Scenario: Secret is set
- **WHEN** `VERCEL_APP_URL` が設定されていて、ジョブが起動する
- **THEN** そのURLに対してリクエストを送信する

#### Scenario: Secret is not set
- **WHEN** `VERCEL_APP_URL` が未設定でジョブが起動する
- **THEN** ジョブはエラーで終了し、URL 未設定である旨がログに残る

## ADDED Requirements

### Requirement: External scheduler pings the warmup endpoint
cron-job.org（このリポジトリ外で管理される外部サービス）が、Vercel 上の `/api/health` に対して2分間隔で GET リクエストを送信する SHALL。あわせて、バックエンド Lambda の Function URL の `/health` にも直接（Vercel を経由せず）2分間隔でリクエストを送信する SHALL。

#### Scenario: Vercel health endpoint is pinged
- **WHEN** cron-job.org のスケジュールが発火する
- **THEN** `https://<vercel-app>/api/health` に GET リクエストが送信され、200 が返る

#### Scenario: Backend Lambda health endpoint is pinged directly
- **WHEN** cron-job.org のスケジュールが発火する
- **THEN** Lambda Function URL の `/health` に直接 GET リクエストが送信され、200 が返る

### Requirement: Warmup target must verifiably invoke a serverless function
ウォームアップ対象のエンドポイントは、リクエストのたびに Vercel の Node.js Function（または同等の実行環境）を実際に起動するものでなければならず、CDN の静的キャッシュから完結する応答であってはならない SHALL。

過去に `/login`（静的prerenderされCDNキャッシュから返るようになっていた）を対象にしたことで、pingは実行され続けていたにもかかわらず対象の関数が一切起動されない、という回帰が発生した（本 change の契機）。この失敗モードを再発させないため、対象選定時にレスポンスヘッダーで検証可能であることを要件とする。

#### Scenario: Target is function-backed
- **WHEN** ウォームアップ対象のURLにGETリクエストを送信する
- **THEN** レスポンスに `x-matched-path` ヘッダーが含まれ、`x-vercel-cache` が `HIT` ではない（関数が実行されたことを示す）

#### Scenario: Target regresses to a static cache
- **WHEN** ウォームアップ対象のURLへの応答が `x-vercel-cache: HIT` を返し、かつ `age` がリクエスト間隔とほぼ1:1で増加し続ける（バックグラウンド revalidation が発生していない）
- **THEN** そのURLはウォームアップ対象として不適格と判断し、別のURLに retarget する

### Requirement: Warmup coverage is limited to the routes actually pinged
Vercel はルートごとに個別の関数を割り当てるため、`/api/health` へのpingは `/api/health` 自身のコールドスタートのみを防ぎ、他のルート（例: `/stock-items`）のコールドスタートを防ぐとみなしてはならない SHALL NOT。認証が必要なルートのウォームアップが必要な場合は、別途そのルート専用の仕組みを設計する。

#### Scenario: Pinging one route does not warm another
- **WHEN** `/api/health` が2分間隔でpingされ続けている
- **THEN** `/stock-items` のような別ルートの関数はこのpingによって温められない（別途の仕組みが必要）
