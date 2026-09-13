## Context

See proposal.md - Why. 詳細な計測結果・検討過程は `docs/superpowers/specs/2026-09-13-stock-items-ttfb-reduction-design.md` に記録済み。

**Phase 0デプロイ後の追加発見(2026-09-13):** 本番のServer-Timing/構造化ログを分析した結果、`fetchStockItems()`（Go Lambda呼び出し）がwarm時でも中央値521ms・p90 653msと、想定より一貫して遅いことが判明した。`x-vercel-id`レスポンスヘッダーを直接確認したところ、Node.js serverless function（`/stock-items`のSSRレンダリング、`/api/health`等）は `iad1`（米国東海岸）で実行されており、`ap-northeast-1`（東京）にあるGo Lambda・Supabaseへの呼び出しはすべて太平洋横断の往復になっていた。`frontend/`に`vercel.json`が存在せずFunction Regionの明示設定が無いため、Vercelのデフォルトリージョンが使われていたことが原因。これはコールドスタートの問題ではなく、地理的なネットワーク往復コストであり、Phase 2（並列化）だけでは解消しない。そのため本設計にPhase 1としてFunction Regionの修正を追加し、Phase 2より優先して実施する。

制約:
- Next.jsのmiddlewareとpage（Server Component）は同一リクエスト内で順番に実行される別フェーズであり、両者を跨いだ並列実行はできない
- Server Component（`page.tsx`）はcookieを書き換えられない。Supabaseのセッションリフレッシュ（cookie書き換えを伴う）は必ずmiddleware側で行う必要がある
- `layout.tsx` の `export const instant = false` と `page.tsx` の非Suspense設計（design.md D2/D3: JS実行前の初期HTMLに実データ）は維持する。ストリーミングでTTFBを回避する方向は取らない
- cold時の遅延がSupabase/Lambdaへの実ネットワーク往復由来か、Vercel関数自体のコールドスタート由来かは、現時点の外部curl計測だけでは切り分けられていない

## Goals / Non-Goals

**Goals:**
- middlewareの認証検証とGo Lambdaへの在庫データ取得を並行実行し、直列だった待ち時間を短縮する
- 並行取得したデータが使える場合、SSRのレンダリングパスからSupabase・Lambdaへの追加のネットワーク往復を排除する
- 本番での区間別所要時間を継続的に観測できるようにする

**Non-Goals:**
- Goバックエンドの認証・JWT検証ロジックの変更
- cron-job.orgのwarmup頻度・ターゲットの見直し（別issue）
- ストリーミングSSR・Suspense境界の導入によるTTFB回避（design.md D2/D3と矛盾するため不採用）

## Decisions

### 0. Vercel Function Regionを東京(hnd1)に固定する（最優先・Phase 1）
`frontend/vercel.json` に `{"regions": ["hnd1"]}` を追加し、Node.js serverless functionの実行リージョンをGo Lambda・Supabaseと同じ`ap-northeast-1`相当（`hnd1`）に固定する。

これはPhase 2（並列化）より優先して単独で実施する。理由:
- 太平洋横断の往復コスト（実測500〜700ms/回）は並列化しても消えない。`getClaims()`（middleware、Edge Runtimeのため既にユーザーに近いリージョンで実行）と`fetchStockItems()`（US東海岸→東京）を並列にしても、遅い方（Lambda呼び出し）に律速される
- 変更が`vercel.json`一行の追加のみで、ロジック変更を伴わずリスクが低い。Phase 2より先に効果を出せる
- Phase 2（重複getSession()の排除・並列発射）は依然として価値がある（Supabase呼び出し回数の削減、直列区間の短縮）ため、Function Region修正の効果を確認した上で継続する

代替案として「Lambda側をUS東海岸にも複製する」も考えられるが、Supabase自体が東京固定である以上、Frontend側をSupabase/Lambdaに合わせる方が変更範囲が小さく、既存のバックエンドインフラに影響しない。

### 1. Lambdaフェッチをmiddleware側に移し、getClaims()とPromise.allで並列発射する
middlewareとpageは同一フェーズ内で並列実行できないため、「認証検証とLambdaフェッチの並列化」を実現するには両方を同じ実行コンテキスト（middleware）内に集約する必要がある。トークンは`getSession()`（ローカルのcookie読み取り、通常はネットワーク往復なし）で先に取り出し、`getClaims()`（検証・必要ならリフレッシュ）と`fetchStockItems(token, activeGroupId)`を同時発射する。

代替案として「page側でPromise.allする」も検討したが、その場合middlewareの認証検証を重複させるか省略する必要があり、cookieリフレッシュの書き込み場所が無くなるため不採用。

### 2. 取得したデータはリクエストヘッダーでpageに引き継ぐ
middlewareとpage間でデータを渡す手段として、(a) リクエストヘッダー、(b) Vercel Runtime Cache等の外部ストア、を検討した。ヘッダーはサイズ制限があるが実装がシンプルで追加の依存もないため採用する。サイズ閾値（暫定6KB）を超えた場合はpage側のフォールバックフェッチに委ねる。

### 3. 未認証確定時はLambda結果を破棄する
`getClaims()`が未認証確定と判定した場合、並行して取得できていたLambda結果があっても`x-pp-initial-items`ヘッダーを付与せず、現行通り`/login`へリダイレクトする。Goバックエンド自身のJWT検証が最終的な安全境界であるため、判定確定前にLambdaへ発射すること自体はリスクを増やさないが、未認証確定後にデータをクライアントへ渡さないことは明示的に保証する。

### 4. Phase 0として観測性を先に投入する
Server-Timing等で「`getClaims()`実行時間」「Lambdaフェッチ実行時間」「フォールバック発生時のフェッチ時間」を計測し、本番実データで内訳を確認してからPhase 2（並列発射の本実装）を確定させる。実際にこの計測データからDecision 0（Function Region問題）が発見された。

## Risks / Trade-offs

- [未認証リクエストに対してもLambdaへの発射が発生し、バックエンド負荷がわずかに増える] → 無効JWTの即時rejectは軽量処理であり、このルートの実トラフィック規模（低頻度）を踏まえると許容範囲。監視は既存のバックエンド観測性に委ねる
- [ヘッダーサイズ超過時にフォールバックへ切り替わることが頻発すると並列化の効果が薄れる] → フォールバック発生率をログ/メトリクスで可視化し、閾値または伝達方式（例: 圧縮）を後から調整できるようにする
- [Phase 0の実測結果次第でPhase 1の設計を見直す必要が生じる] → tasks.mdでPhase 0完了後に判断ポイントを明示し、Phase 1着手前にユーザー確認を挟む

## Migration Plan

1. Phase 0（観測性）を実装・デプロイし、本番でServer-Timingデータを収集する — 完了（PR #297）
2. 収集データの分析からFunction Region問題を発見。Phase 1としてリージョン修正を実装・デプロイし、`x-vercel-id`ヘッダーが`hnd1`になったこと・区間計測の値が改善したことを確認する
3. Phase 1の効果を確認した上で、Phase 2（並列発射・ヘッダー伝達）に進むか設計を見直すかを判断する
4. Phase 2実装後、`e2e/ssr-stock-items.spec.ts`（`javaScriptEnabled: false`）で回帰確認する
5. ロールバックはfeatureブランチのrevertで対応可能（Goバックエンド側の変更が無いため、フロントエンドのみのロールバックで完結する）

## Open Questions

- ヘッダーサイズ閾値の具体的な値（暫定6KB）は、実運用の在庫アイテム数分布を見て調整する余地がある。Phase 2実装時のタスクとして扱う
