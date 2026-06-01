## Context

`frontend/src/app/layout.tsx` はルートレイアウトとして全ページに共通の `<head>` を提供する。現状、Lambda Function URL (`NEXT_PUBLIC_API_BASE_URL`) と Supabase (`NEXT_PUBLIC_SUPABASE_URL`) へのリソースヒントは存在しない。ブラウザは HTML パース後にスクリプトが実行されるまでこれらのホストへの DNS 解決・TCP 接続・TLS ハンドシェイクを開始しないため、200–500ms のロスが生じる。

## Goals / Non-Goals

**Goals:**
- HTML 配信と同時に Lambda / Supabase への preconnect を開始し、DNS+TLS を並列処理する
- 環境変数未設定時に余分なリソースヒントを出力しない

**Non-Goals:**
- API レスポンスの prefetch（データ取得はクライアント側 SWR/fetch に委ねる）
- Service Worker による preconnect 制御
- 動的なホスト名解決（実行時ではなくビルド時環境変数のみ使用）

## Decisions

### preconnect + dns-prefetch の両方を出力する

`rel="preconnect"` は TCP/TLS まで確立するが、対応ブラウザ（Safari 旧バージョン等）が preconnect を無視するケースがある。`rel="dns-prefetch"` を併記することでフォールバックとして DNS 解決だけでも先行させる。

代替案: preconnect のみ → Safari 旧版での恩恵なし。dns-prefetch のみ → TLS ハンドシェイクが並列化されない。両方が最適。

### crossOrigin="anonymous" を指定する

CORS リクエスト（fetch API が送信する認証情報なしリクエスト）と preconnect の接続プールを一致させるために必要。これがないとブラウザが別の接続を作り直す場合がある。

### 環境変数を直接参照し、未設定時はリンクを出力しない

`process.env.NEXT_PUBLIC_API_BASE_URL` が `undefined` のときは `<link>` を出力しない。空文字列や無効 URL による preconnect エラーを防ぐ。デフォルト値 (`http://localhost:8080`) は設定しない — localhost への preconnect は意味がないため。

## Risks / Trade-offs

- **未使用 preconnect によるリソース浪費** → preconnect は TCP 接続を即確立するため、接続が実際に使われない場合は無駄になる。ただし Lambda / Supabase は必ず初回ロード時に使用されるため問題ない。
- **本番のみ環境変数が設定されている** → ローカル開発時は環境変数が設定されていないため preconnect が出力されない。ローカルでは localhost への接続でロスが少ないため許容範囲。
- **NEXT_PUBLIC_ 変数の変更がビルド再デプロイを必要とする** → 既存の制約と同じ。追加リスクなし。
