## Context

Issue #256（Phase A、PR #257）の最終ブランチ全体レビューで、merge をブロックしない3件の Important 指摘が見つかった（Issue #258）。いずれも Phase B（Issue #182、stock-items の Server Component 化）でサーバー側からデータを返す経路が増えると影響が顕在化しうる。本 change はこの3件に対応し、Phase B 着手の前提条件を満たす。

対象ファイルは `frontend/src/middleware.ts`（Phase A で新規作成、Task 3）と `frontend/src/components/AuthGuard.tsx`。両ファイルの現在の実装・コメントは Phase A の設計判断（Decision 3: middleware は認可の境界ではなく UX ゲート、AuthGuard は no-group 判定のみ残す）を前提にしている。

## Goals / Non-Goals

**Goals:**
- middleware の fail open を「セッション状態を確定できない場合」に限定し、確定的に無効なトークンは未ログイン扱いにする
- 受動的なセッション喪失（ページ遷移を伴わない）が起きたとき、`AuthGuard` がユーザーに状況を伝えるフォールバックUIを表示する
- middleware の JWKS 取得をモジュールレベルでキャッシュし、認証済みリクエストごとの再取得コストを削減する

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

### Decision 3: JWKS キャッシュはモジュールレベルの TTL キャッシュとして実装し、`getClaims()` に `jwks` オプションで渡す

`frontend/src/lib/jwksCache.ts`（新規）に、`NEXT_PUBLIC_SUPABASE_URL` から導出した JWKS discovery endpoint（`{supabaseUrl}/auth/v1/.well-known/jwks.json`）を fetch し、結果を `{ keys: JWK[], fetchedAt: number }` の形でモジュールレベル変数にキャッシュする関数を実装する。TTL は Supabase 公式ドキュメントの JWKS ローテーション推奨に合わせて長め（例: 10分）に設定し、キャッシュが無い/期限切れのときのみ fetch する。取得した `keys` を `middleware.ts` の `getClaims(undefined, { jwks: { keys } })` に渡す。

fetch 自体が失敗した場合は `undefined` を返し、呼び出し側（`middleware.ts`）は `jwks` オプションを渡さずに `getClaims()` を呼ぶ（ライブラリ自身のデフォルトの取得・キャッシュ経路にフォールバックする）——Decision 1 で新設した fail open 分類とは独立した話で、JWKS 取得失敗そのものを「認証失敗」として扱わない。

**確認事項（実装時に必ず検証する）**: `JWK` 型は `@supabase/auth-js/dist/module/lib/types.d.ts` で定義されているが、`@supabase/supabase-js`・`@supabase/ssr` のトップレベルから re-export されているかは未確認。実装時に `node_modules` の型定義を直接確認し、re-export されていなければ `@supabase/auth-js` から直接 import するか、必要な形（`{ kty, key_ops, alg?, kid? }` 等）だけをローカルで定義する。

検討した代替案: Vercel の Edge Config や KV など外部キャッシュストアを使う。採用しなかった理由: 新規インフラ依存を増やすほどの問題ではなく、モジュールレベルの変数キャッシュ（Vercel Edge Runtime のアイソレート再利用で効く、コールドスタートでは単に初回フェッチに戻るだけで実害はない）で十分。過剰設計を避ける。

## Risks / Trade-offs

- [Risk] Decision 1 の3分類は `@supabase/auth-js` の非公開に近い内部エラークラスの命名に依存する。ライブラリのメジャーバージョンアップでクラス名やこの型ガード関数が変わる可能性がある → 型ガード関数（`isAuthRetryableFetchError` 等）はライブラリが公開 export している安定した API であり、内部実装の詳細ではない。バージョンアップ時は `frontend/package.json` のバージョン選定ルール（general.md）に従い変更ログを確認する
- [Risk] Decision 2 のフォールバックUIは新しいテスト対象コンポーネント/分岐を追加する。既存の `AuthGuard.test.tsx` の各テストケース（no-group リダイレクト、loading 中の非リダイレクト等）が新しい3値分岐と衝突しないか実装時に確認する
- [Trade-off] Decision 3 の TTL キャッシュは「多少古い鍵セットを使う」可能性を許容する。Supabase の鍵ローテーションは十分低頻度（通常運用では鍵は頻繁に変わらない）と想定されるため実害は小さいが、万一直近でローテーションされた場合、TTL 内は新しい鍵で署名されたトークンの検証に失敗しうる。この失敗は Decision 1 により「確定的に無効」（`AuthInvalidJwtError`）として扱われ、fail open ではなくリダイレクトされてしまう懸念がある → 実装時に `getClaims()` が `jwks` オプションで渡した鍵セットで検証に失敗した場合、ライブラリ自身が最新鍵セットへのフォールバック・リトライを行うかどうかを確認する。行わない場合は、TTL 内であっても「渡した鍵セットで検証失敗」時は `jwks` オプション無しで一度だけ再試行するなどのセーフティネットを検討する

## Migration Plan

- DB スキーマ変更なし、破壊的変更なし（既存の認証済みユーザーへの影響なし）
- ロールバック: 通常の revert で良い（状態を持つ移行処理ではない）

## Open Questions

（なし。ブランチレビューで指摘された3件とも技術的な調査（JWKS 鍵種別の確認、`getClaims()` の `jwks` オプション、エラー型ガード関数の存在）が完了しており、実装方針は確定している）
