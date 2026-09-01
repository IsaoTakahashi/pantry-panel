## Why

フロントエンド(Vercel)からバックエンド(Lambda Function URL)への API 呼び出しはクロスオリジンであり、カスタムヘッダー(`Authorization`, `X-Active-Group-ID` 等)を使うため各リクエストの前に preflight (`OPTIONS`) が発生する。現在 Echo の CORS ミドルウェアに `Access-Control-Max-Age` が設定されておらず、ブラウザは preflight 結果をキャッシュできず、同一オリジン・メソッド・ヘッダーの組み合わせでも毎回 `OPTIONS` を送る。Issue #179 epic の調査(PR #217 系)で follow-up として記録された。モバイル回線では preflight の往復もそのまま遅延に乗るため、削減効果がある。

## What Changes

- `backend/main.go` の `middleware.CORSWithConfig` に `MaxAge` を設定し、ブラウザに preflight 結果をキャッシュさせる
- 値は Chromium 系ブラウザの実効上限である `7200`(2時間)秒とする。`CORS_ALLOWED_ORIGINS` はデプロイ時にしか変わらない環境変数であり、この程度のキャッシュ期間でも許可オリジンの変更が反映されないリスクは実質無い(次回デプロイ後の新規セッションでは新しい preflight が発生する)

## Capabilities

### New Capabilities
(なし)

### Modified Capabilities
- `production-backend-runtime`: 既存の CORS 関連 Requirement 群に、新規 Requirement「preflight レスポンスに Access-Control-Max-Age を設定する」を追加する(既存の origin 切り替え Requirement 自体は変更しない)

## Impact

- `backend/main.go`: CORS ミドルウェア設定に `MaxAge: 7200` を追加
- `backend/main_test.go`: 設定値を検証するテストを追加
- 影響範囲はバックエンドのみ。フロントエンド・DB・インフラ構成に変更なし
