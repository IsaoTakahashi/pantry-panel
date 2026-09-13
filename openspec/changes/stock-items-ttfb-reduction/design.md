## Context

See proposal.md - Why. 詳細な計測結果・検討過程は `docs/superpowers/specs/2026-09-13-stock-items-ttfb-reduction-design.md` に記録済み。

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

### 1. Lambdaフェッチをmiddleware側に移し、getClaims()とPromise.allで並列発射する
middlewareとpageは同一フェーズ内で並列実行できないため、「認証検証とLambdaフェッチの並列化」を実現するには両方を同じ実行コンテキスト（middleware）内に集約する必要がある。トークンは`getSession()`（ローカルのcookie読み取り、通常はネットワーク往復なし）で先に取り出し、`getClaims()`（検証・必要ならリフレッシュ）と`fetchStockItems(token, activeGroupId)`を同時発射する。

代替案として「page側でPromise.allする」も検討したが、その場合middlewareの認証検証を重複させるか省略する必要があり、cookieリフレッシュの書き込み場所が無くなるため不採用。

### 2. 取得したデータはリクエストヘッダーでpageに引き継ぐ
middlewareとpage間でデータを渡す手段として、(a) リクエストヘッダー、(b) Vercel Runtime Cache等の外部ストア、を検討した。ヘッダーはサイズ制限があるが実装がシンプルで追加の依存もないため採用する。サイズ閾値（暫定6KB）を超えた場合はpage側のフォールバックフェッチに委ねる。

### 3. 未認証確定時はLambda結果を破棄する
`getClaims()`が未認証確定と判定した場合、並行して取得できていたLambda結果があっても`x-pp-initial-items`ヘッダーを付与せず、現行通り`/login`へリダイレクトする。Goバックエンド自身のJWT検証が最終的な安全境界であるため、判定確定前にLambdaへ発射すること自体はリスクを増やさないが、未認証確定後にデータをクライアントへ渡さないことは明示的に保証する。

### 4. Phase 0として観測性を先に投入する
Server-Timing等で「`getClaims()`実行時間」「Lambdaフェッチ実行時間」「フォールバック発生時のフェッチ時間」を計測し、本番実データで内訳を確認してからPhase 1（並列発射の本実装）を確定させる。cold差分の大半が関数コールドスタート由来だった場合、本設計の効果は限定的になるため、その場合は設計を見直す判断ゲートとする。

## Risks / Trade-offs

- [未認証リクエストに対してもLambdaへの発射が発生し、バックエンド負荷がわずかに増える] → 無効JWTの即時rejectは軽量処理であり、このルートの実トラフィック規模（低頻度）を踏まえると許容範囲。監視は既存のバックエンド観測性に委ねる
- [ヘッダーサイズ超過時にフォールバックへ切り替わることが頻発すると並列化の効果が薄れる] → フォールバック発生率をログ/メトリクスで可視化し、閾値または伝達方式（例: 圧縮）を後から調整できるようにする
- [Phase 0の実測結果次第でPhase 1の設計を見直す必要が生じる] → tasks.mdでPhase 0完了後に判断ポイントを明示し、Phase 1着手前にユーザー確認を挟む

## Migration Plan

1. Phase 0（観測性）を実装・デプロイし、本番でServer-Timingデータを収集する
2. データを確認し、Phase 1（並列発射・ヘッダー伝達）に進むか設計を見直すかを判断する
3. Phase 1実装後、`e2e/ssr-stock-items.spec.ts`（`javaScriptEnabled: false`）で回帰確認する
4. ロールバックはfeatureブランチのrevertで対応可能（Goバックエンド側の変更が無いため、フロントエンドのみのロールバックで完結する）

## Open Questions

- ヘッダーサイズ閾値の具体的な値（暫定6KB）は、実運用の在庫アイテム数分布を見て調整する余地がある。Phase 1実装時のタスクとして扱う
