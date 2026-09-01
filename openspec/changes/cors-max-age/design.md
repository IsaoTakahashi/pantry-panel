## Context

`backend/main.go` の Echo CORS ミドルウェア(`middleware.CORSWithConfig`)には `MaxAge` が設定されておらず(デフォルト 0 = ヘッダー未送信)、ブラウザは preflight (`OPTIONS`) 結果をキャッシュできない。フロントエンドは `Authorization` ヘッダーや `X-Active-Group-ID` カスタムヘッダーを使うため、単純リクエストの条件を満たさず preflight が必須になっている。

## Goals / Non-Goals

**Goals:**
- `Access-Control-Max-Age` を設定し、ブラウザが preflight 結果を一定時間キャッシュできるようにする
- モバイル回線での不要な preflight 往復を削減する

**Non-Goals:**
- CORS の origin 許可ロジック(`CORS_ALLOWED_ORIGINS`/`UnsafeAllowOriginFunc`)自体の変更
- Function URL 側の CORS 設定変更(既存通り空 `{}` を維持し、Echo 側に一本化する方針は変えない)

## Decisions

### MaxAge の値は 7200 秒(2時間)とする

**決定:** `middleware.CORSConfig.MaxAge` に `7200` を設定する。

**理由:** ブラウザ実装は `Access-Control-Max-Age` に送信側が指定した値をそのまま尊重せず、独自の上限でクランプする(Chromium 系は 7200 秒が実効上限、Firefox は 86400 秒、Safari/WebKit はより短い独自上限)。全ブラウザで共通して活きる値として、最も widely-used な Chromium の上限である 7200 秒を採用する。これより大きい値を設定しても Chromium 上では意味を持たないため、実効値と設定値を一致させることで意図が明確になる。

`CORS_ALLOWED_ORIGINS` は Lambda の環境変数でありデプロイ時にしか変わらないため、2時間程度のキャッシュ期間でも「許可オリジンを変更したのに古いキャッシュのせいで反映されない」実害は無い(次回のブラウザセッション・タブ再読み込みで新しい preflight が発生し最新の設定が適用される)。

**検討した代替案:**
- *86400 秒(Firefox の上限)を採用する* → Chromium ではどのみち 7200 秒にクランプされるため、設定値と実効値が乖離し意図が読み取りにくくなる。見送り。
- *より短い値(600秒等、Safari 系を意識)* → キャッシュ効果が小さくなる。CORS_ALLOWED_ORIGINS の変更頻度を踏まえると、短くする実害回避のメリットは薄い。見送り。

## Risks / Trade-offs

- **[Risk] 許可オリジンを削除・変更した直後、キャッシュが残っているブラウザからのリクエストが最大2時間、変更前の判定で処理され続ける可能性** → 実際には `Access-Control-Max-Age` は「preflight自体をスキップしてよい期間」を制御するだけで、本リクエスト自体の CORS ヘッダー検証はブラウザ側で毎回行われる。preflight をスキップした本リクエストであっても、サーバ側の `UnsafeAllowOriginFunc` は毎リクエスト評価されるため、許可されていない origin へのアクセスがこのキャッシュによって新たに許可されることはない。実害は「削除した origin からの残存 preflight スキップ」程度で、セキュリティ上の懸念はない

## Migration Plan

- Feature flag 不要。単一の設定値追加でありデプロイすれば即座に有効
- ロールバック: PR revert で `MaxAge` を削除すれば旧挙動(preflightキャッシュなし)に戻る

## Open Questions

- なし
