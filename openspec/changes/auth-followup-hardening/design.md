## Context

Issue #256（Phase A、PR #257）の最終ブランチ全体レビューで、merge をブロックしない3件の Important 指摘が見つかった（Issue #258）。いずれも Phase B（Issue #182、stock-items の Server Component 化）でサーバー側からデータを返す経路が増えると影響が顕在化しうる。本 change はこの3件に対応し、Phase B 着手の前提条件を満たす。

対象ファイルは `frontend/src/middleware.ts`（Phase A で新規作成、Task 3）と `frontend/src/components/AuthGuard.tsx`。両ファイルの現在の実装・コメントは Phase A の設計判断（Decision 3: middleware は認可の境界ではなく UX ゲート、AuthGuard は no-group 判定のみ残す）を前提にしている。

## Goals / Non-Goals

**Goals:**
- middleware の fail open を「セッション状態を確定できない場合」に限定し、確定的に無効なトークンは未ログイン扱いにする
- 受動的なセッション喪失（ページ遷移を伴わない）が起きたとき、`AuthGuard` がユーザーに状況を伝えるフォールバックUIを表示する
- middleware の JWKS 再取得コストについて、実装が必要かどうかを実装時の調査で確定させる（結果: 不要、Decision 3 参照）

**Non-Goals:**
- Phase B（stock-items の Server Component 化）自体
- middleware を実際の認可境界にすること（Decision 3 は維持: サーバー側データ経路は各自が独立してセッション・認可を検証する責務を負う。本 change は fail open の対象を狭めるだけで、middleware 通過＝認可済みという前提には変えない）
- リフレッシュトークン失効以外の、より広い「セッション整合性」全般の扱い直し

## Decisions

### Decision 1: fail open の判定を「retryable なエラー」「discard 系のレース」「それ以外（確定的に無効）」の3分類にする

`middleware.ts` の `getClaims()` 呼び出し後の `data === null && error !== null` 分岐を、`error` の実際のクラスで再分類する。`@supabase/auth-js` はエラー種別を判別する型ガード関数を公開しており（`node_modules/@supabase/auth-js/dist/module/lib/errors.js` で確認済み）、これを使う:

- `isAuthRetryableFetchError(error)` が true → fail open（ネットワーク障害等、リフレッシュ処理自体が retryable に失敗した場合。既存の意味論のまま維持）
- `isAuthRefreshDiscardedError(error)` が true → fail open（同ライブラリのドキュメントコメントより: 並行する `signOut` がリフレッシュ結果を破棄しただけで、トークン自体が無効というわけではない。次回リフレッシュで解決するレースコンディションであり、これを「無効トークン」として弾くと同時ログアウト操作と正常なページ遷移が競合したときに誤ってユーザーを蹴ることになる）
- 上記いずれでもない場合（`AuthInvalidJwtError`、`AuthApiError` 等）→ 確定的に無効と判定し、`isDefinitelyUnauthenticated = true` として扱う（保護ルートであれば `/login` へリダイレクト）

例外（`catch` ブロック）は現状維持で fail open のまま変更しない——`getClaims()` 自体が例外を投げるのは通信層の失敗（WebCrypto 非対応環境でのフォールバック中の fetch 失敗等）であり、性質としては retryable 分類に近いため。

検討した代替案: 「ホワイトリスト方式で無効判定するエラーだけを列挙する」（例: `AuthInvalidJwtError` だけを明示的にチェック）。採用しなかった理由: 新しいエラークラスが将来追加されたときに安全側（redirect）にフォールバックせず、逆に安全でない側（fail open）にフォールバックしてしまう。今回は「retryable と分かっているものだけ fail open、それ以外は全部 redirect」という安全側デフォルトのホワイトリスト方式を採る。

### Decision 2: `AuthGuard` のフォールバックUIは新規コンポーネント内で完結させ、既存のレンダー分岐を壊さない

現在の `AuthGuard.tsx` は `if (session && (group || speculativeGroupId)) return children; return null;` という2値の分岐。ここに3つ目の状態「`loading` が false かつ `session` が null（かつ `authEnabled`）」を追加し、この場合だけ「セッションが切れました。ログインページへ」という静的なメッセージ＋リンクを表示する。

- 判定条件: `authEnabled && !loading && !session` のとき、`children` の代わりにフォールバックUIを返す（`null` ではなく）
- フォールバックUIはリダイレクトを行わない（router.push 等は呼ばない）。Decision 3（Phase A、AuthGuard は未ログインリダイレクトを行わない MUST NOT）を維持したまま、表示だけを変える
- ログインページへのリンクは通常の `<a href="/login">` または `next/link` の `<Link>` を使う（クリックで通常のブラウザナビゲーションが発生し、middleware が改めてセッションを検証する経路に乗る。これにより「本当にセッションが無いか」を再確認してから `/login` に着地する、既存の `signOut()` の `router.replace` とは異なる自然なナビゲーション）

検討した代替案: `signOut()` と同様に `router.replace("/login")` で自動リダイレクトする。採用しなかった理由: これは Issue #258 の指摘そのものが「AuthGuard に自動リダイレクトを追加すべきでない（Decision 3 の MUST NOT に抵触する）」という前提で書かれており、フォールバック**表示**の追加に留めることが明示的に推奨されている。ユーザー操作（リンククリック）を挟むことで、意図しない自動リダイレクトの連鎖（Task 6.3 で一度実際に踏んだ事故のクラス）を再発させない。

### Decision 3（撤回）: 独自 JWKS キャッシュは実装しない——`@supabase/auth-js` が同等のキャッシュを既に内蔵している

当初案（`frontend/src/lib/jwksCache.ts` を新規実装し `getClaims(undefined, { jwks: { keys } })` で渡す）は実装着手前の調査（tasks.md 3.6、controller 自身による `node_modules/@supabase/auth-js` ソース調査）で撤回した。根拠:

1. **本番プロジェクトの署名鍵は ES256（非対称鍵）である**: `curl https://<project>.supabase.co/auth/v1/.well-known/jwks.json` で実際に確認済み。`getClaims()` は非対称鍵の場合、`getUser()` のようなサーバーへの往復リクエストを行わず、JWKS を使ったローカル検証（WebCrypto）を行う（`GoTrueClient.js` の `getClaims()` 実装・JSDoc で確認）。
2. **`@supabase/auth-js` はモジュールレベルの JWKS キャッシュ（`GLOBAL_JWKS`）を既に持つ**: `GoTrueClient.js` 冒頭のコメントに明記されている: 「Caches JWKS values for all clients created in the same environment. This is especially useful for shared-memory execution environments such as Vercel's Fluid Compute, AWS Lambda or Supabase's Edge Functions.」——本プロジェクトのデプロイ構成（Vercel + AWS Lambda + LWA）そのものを名指しした、ライブラリが意図的に提供している最適化である。このキャッシュは `storageKey`（本プロジェクトでは全 `createServerClient` 呼び出しで固定値）をキーに、TTL = `JWKS_TTL`（10分）で管理される。
3. **鍵ローテーションも kid-miss で正しく扱われる**: `fetchJwk(kid, jwks)` の実装は「呼び出し側が渡した `jwks` 内に `kid` があればそれを使う → なければ自分の内部キャッシュ内に `kid` があり、かつ TTL 内ならそれを使う → どちらにも無ければ（TTL 内かどうかに関わらず）即座にネットワークから再取得し、内部キャッシュを更新する」という順序。TTL はあくまで「見つかった鍵をどれだけ信用するか」を制御するだけで、ローテーションで新しい `kid` が来た場合は TTL 残り時間に関わらず必ず即時再取得される。design.md の当初の Trade-off（TTL 内はローテーション後の鍵で検証失敗しうる）は成立しない。

自前でモジュールレベルキャッシュを実装しても、ライブラリが既に持つ `GLOBAL_JWKS` と全く同じ特性（プロセス/アイソレート単位で永続、TTL 10分、kid-miss で即時再取得）を重複して持つだけで、追加の性能上の利益はゼロである。CLAUDE.md の「タスクが要求する以上の抽象化を導入しない」に反するため実装しない。

tasks.md の Task 3 はこの調査結果を記録する1タスクに縮小する（新規ファイル `jwksCache.ts` は作成しない）。

## Risks / Trade-offs

- [Risk] Decision 1 の3分類は `@supabase/auth-js` の非公開に近い内部エラークラスの命名に依存する。ライブラリのメジャーバージョンアップでクラス名やこの型ガード関数が変わる可能性がある → 型ガード関数（`isAuthRetryableFetchError` 等）はライブラリが公開 export している安定した API であり、内部実装の詳細ではない。バージョンアップ時は `frontend/package.json` のバージョン選定ルール（general.md）に従い変更ログを確認する
- [Risk] Decision 2 のフォールバックUIは新しいテスト対象コンポーネント/分岐を追加する。既存の `AuthGuard.test.tsx` の各テストケース（no-group リダイレクト、loading 中の非リダイレクト等）が新しい3値分岐と衝突しないか実装時に確認する
- [Retracted] Decision 3 の当初案が想定していた「TTL 内のローテーションで検証失敗する」Trade-off は、調査の結果、成立しないことが判明した（`fetchJwk` の kid-miss は TTL に関わらず即時再取得するため）。この Trade-off 自体が Decision 3 撤回の根拠の一部である

## Migration Plan

- DB スキーマ変更なし、破壊的変更なし（既存の認証済みユーザーへの影響なし）
- ロールバック: 通常の revert で良い（状態を持つ移行処理ではない）

## Open Questions

（なし。ブランチレビューで指摘された3件とも技術的な調査（JWKS 鍵種別の確認、`getClaims()` の `jwks` オプション、エラー型ガード関数の存在）が完了しており、実装方針は確定している）
