## Why

Issue #256（Phase A: 認証を @supabase/ssr の cookie ベースに移行する、PR #257）の最終ブランチ全体レビューで、merge をブロックしない Phase A の範囲では実害なしと判断された3件の Important 指摘が見つかった（Issue #258）。いずれも Phase B（stock-items の Server Component 化、Issue #182）でサーバー側からデータを返す経路が増えると load-bearing になる、または UX 上の実害が顕在化しうる問題であり、Phase B 着手前に対応する。

## What Changes

- middleware の fail open を、セッション状態を確定できない場合（ネットワーク障害等の retryable なエラー）に限定する。トークンが確定的に無効と判定された場合（署名検証失敗等）は fail open せず、未ログイン扱いとして扱い保護ルートであれば `/login` へリダイレクトする
- `AuthGuard` に、ページ遷移を伴わない受動的なセッション喪失（別タブでのサインアウト、リフレッシュトークン失効等）が起きた場合のフォールバックUI（「セッションが切れました→ログインする」）を追加する。リダイレクトではなく表示の変更のみ行う
- middleware の JWKS（JSON Web Key Set）取得をモジュールレベルで TTL キャッシュし、`getClaims()` に `jwks` オプションとして渡す。認証済みリクエスト（RSC プリフェッチ含む）ごとに JWKS を再取得するコストを削減する。バックエンドが `SUPABASE_JWKS_URL` を使用していることから本プロジェクトは非対称鍵（asymmetric JWT signing key）運用であることを確認済みで、`@supabase/auth-js` の `getClaims(jwt?, { jwks })` がこのキャッシュを直接サポートしている

## Capabilities

### New Capabilities
（なし）

### Modified Capabilities
- `ssr-session-auth`: 「middleware は全リクエストでセッションをリフレッシュする」Requirement を、fail open の対象を retryable なエラーに限定する形へ変更する（既存の Known Limitation を解消）
- `auth-guard`: 受動的なセッション喪失時にフォールバックUIを表示する Requirement を追加する

## Impact

- `frontend/src/middleware.ts`（fail open 判定ロジックの変更、JWKS キャッシュの追加）
- `frontend/src/lib/`（JWKS キャッシュ用の新規モジュール、想定: `jwksCache.ts` 等）
- `frontend/src/components/AuthGuard.tsx`（受動的セッション喪失時のフォールバックUI追加）
- テスト: `middleware.test.ts`、`AuthGuard.test.tsx` に新規シナリオ追加
- backend への影響なし
- Phase B（Issue #182）の前提条件を満たす。Phase B 自体のスコープ（Server Component 化）はこの change に含まない

## ユーザーシナリオとテスト設計

シナリオ数は5件（S-1〜S-5）で `.claude/rules/testing.md` の「6件以上で `e2e-design.md` に切り出す」閾値を超えないため、本セクションにインラインで収める。

本 change はバックエンドのコードに影響しない（backend は引き続き `Authorization: Bearer <token>` を JWKS で検証するのみで、本 change が触るのは middleware の fail open 分類・AuthGuard のレンダー分岐・Next.js 側 JWKS キャッシュという、いずれも Next.js アプリ内に閉じた関心事）。したがって **バックエンドシナリオのセクションは設けない**（`ssr-cookie-auth-phase-a` が同じ理由でこのセクションを省略したのと同じ判断）。

### フロントエンドシナリオ

#### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | retryable なエラーは fail open で通過する（回帰・discriminator 更新） | - | Frontend Integration |
| S-2 | discard 系エラー（並行 signOut によるレース）は fail open で通過する | - | Frontend Integration |
| S-3 | 確定的に無効なトークンは fail open せず /login へリダイレクトする（新規挙動） | - | Frontend Integration |
| S-4 | 受動的セッション喪失時にフォールバックUIを表示し、自動リダイレクトはしない | - | Frontend Unit |
| S-5 | loading 中はフォールバックUIを表示しない（既存 loading 分岐の維持） | - | Frontend Unit |

補足: JWKS キャッシュ（Decision 3）は上記に S-番号を振らず、サマリ表の後に別セクションとして扱う。理由は末尾の「JWKS キャッシュのテスト方針」を参照。

---

#### S-1: retryable なエラーは fail open で通過する（回帰・discriminator 更新）
**Given:** 保護ルートへのリクエストで、`supabase.auth.getClaims()` が `{ data: null, error }` を resolve し、`error` が `isAuthRetryableFetchError(error)` を満たす（ネットワーク断等）
**When:** middleware がこのリクエストを処理する
**Then:** リダイレクトせず後続処理に進む（`NextResponse.next()` 相当、status 200）。console.error で observability ログが残る（既存挙動）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | `middleware.ts` を `NextRequest` を組み立てて直接呼び出し、`getClaimsMock` が `{ data: null, error: <AuthRetryableFetchError インスタンス> }` を返すとき、レスポンスが redirect ではなく通過になることを確認する | **重要**: `@supabase/auth-js` の `isAuthRetryableFetchError` は `isAuthError(error) && error.name === "AuthRetryableFetchError"` で判定し、`isAuthError` は `"__isAuthError" in error` を見る（`node_modules/@supabase/auth-js/dist/module/lib/errors.js` で確認済み、`instanceof` ではなくダックタイピング）。現行 `middleware.test.ts` の該当テストは `{ name: "AuthRetryableFetchError", message: "..." }` という `__isAuthError` を持たないプレーンオブジェクトを使っており、Decision 1 実装後はこの型ガードを満たさず「確定的に無効」側に誤分類されてしまう（テストとしては redirect されて red になり気づけるが、意図は「fail open の回帰確認」なので偽装が正しくない）。実装時は `new AuthRetryableFetchError("fetch failed", 0)`（同モジュールから import、または `@supabase/supabase-js`/`@supabase/ssr` からの re-export を確認）等、型ガードを実際に満たすインスタンスに置き換える |

**E2E判定:** No
**理由:** 判断ツリー Q1（ブラウザ必須か）= No。`middleware.ts` はプレーンな関数であり `NextRequest`/`NextResponse` を直接組み立てて呼び出せる（`ssr-cookie-auth-phase-a` の S-7/S-8 と同じパターン）。加えて Playwright の `page.route()` はブラウザ発のリクエストしか対象にできず、middleware がサーバー側で `getClaims()` に返させるエラーの種別を E2E から確定的に注入する手段がない（同 S-7/S-8 の理由をそのまま踏襲）

---

#### S-2: discard 系エラー（並行 signOut によるレース）は fail open で通過する
**Given:** 保護ルートへのリクエストで、`getClaims()` が `{ data: null, error }` を resolve し、`error` が `isAuthRefreshDiscardedError(error)` を満たす（並行する `signOut` がリフレッシュ結果を破棄した）
**When:** middleware がこのリクエストを処理する
**Then:** リダイレクトせず後続処理に進む（status 200）。トークン自体が無効というわけではないため「確定的に無効」側に分類されない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | S-1 と同じ直接呼び出しパターンで、`getClaimsMock` が `new AuthRefreshDiscardedError()`（同モジュールから import）を含む結果を返すとき通過になることを確認する | Decision 1 で新設した3分類のうち、旧実装（Phase A）にはそもそも存在しなかった分岐。旧実装は「`error !== null` なら常に fail open」だったため discard 系も結果的に通過しており、旧コードに対する discriminator にはならない。ただし「discard を誤って“確定的に無効”側に分類する」ような実装バグ（3分類の実装ミス）に対しては red になる、新3分類自体に対する discriminator として機能する |

**E2E判定:** No
**理由:** S-1 と同じ（Q1 = No、サーバー間通信のエラー種別を E2E から注入できない）

---

#### S-3: 確定的に無効なトークンは fail open せず /login へリダイレクトする（新規挙動）
**Given:** 保護ルートへのリクエストで、`getClaims()` が `{ data: null, error }` を resolve し、`error` が `isAuthRetryableFetchError` にも `isAuthRefreshDiscardedError` にも該当しない（例: `AuthInvalidJwtError` や一般的な `AuthApiError` インスタンス。署名検証失敗等）
**When:** middleware がこのリクエストを処理する
**Then:** fail open せず、未ログイン扱いとして `/login` へリダイレクトする（`NextResponse.redirect`、status 307）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | S-1 と同じ直接呼び出しパターンで、`getClaimsMock` が `new AuthInvalidJwtError("Token signature is invalid")`（型ガードのいずれも満たさないインスタンス）を返すとき、レスポンスが `/login` への redirect になることを確認する | **これが Decision 1 の真の discriminator**: 旧実装（Phase A）は `data === null && error !== null` を一律 fail open としていたため、このケースでも通過していた（旧コードでは red にならない = 本テストは旧コードに対して確実に red になる）。新実装ではこのケースだけが redirect に変わる。「あり得る到着順序をすべて列挙する」教訓（2026-09-01 ログ）と同じ精神で、3分類のうち退避的な2分類（S-1, S-2）だけでなく、本来の主目的である「それ以外は redirect」を明示的に検証する |
| Frontend Integration（非保護ルート） | 同じエラーで非保護ルート（例: `/health`）へのリクエストの場合はリダイレクトしないことを確認する | 既存の「非保護ルート・セッション無しでもリダイレクトしない」テストの error 版。`isDefinitelyUnauthenticated` の判定自体は変わるが、redirect 判定は `matchesPath(..., PROTECTED_PATHS)` と AND を取るロジックが未変更であることの回帰確認 |

**E2E判定:** No
**理由:** 判断ツリー Q1 = No（middleware 単体呼び出しで完結）。加えて、ブラウザレベルで「middleware が /login へリダイレクトする」という配線自体（cookie 引き継ぎ、redirect header 等）は `ssr-cookie-auth-phase-a` の S-4/S-4回帰で既に E2E 実証済みであり、本 change が変えるのは「どのエラーがその配線に到達するか」という分類ロジックのみ。実際に "確定的に無効な署名" を持つ本物の cookie を E2E（Preview）で用意して Supabase に実際に拒否させることは技術的に可能だが、S-1〜S-3 で分類ロジックそのものを確定的に検証できる以上、追加の E2E は重複コストに見合わない

---

#### S-4: 受動的セッション喪失時にフォールバックUIを表示し、自動リダイレクトはしない
**Given:** Supabase 認証が有効（`authEnabled`）で、`loading` が `false`、`session` が `null`（別タブでのサインアウト・リフレッシュトークン失効等によりクライアント側で session が失われた状態を `useAuth()` の戻り値として再現）
**When:** `AuthGuard` を render する
**Then:** children の代わりに「セッションが切れました」旨のメッセージと `/login` へのリンクが表示される。`router.push`/`router.replace` は呼ばれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | `useAuth` を mock して `{ session: null, loading: false }` を返させ、render 結果にフォールバックメッセージと `/login` へのリンク（`getByRole("link", { name: /login|ログイン/ })` 等）が存在することを確認する | 既存 `AuthGuard.test.tsx` の mock パターン（`vi.mock("@/contexts/AuthContext")`）をそのまま踏襲 |
| Frontend Unit | 同条件で `mockPush`（`useRouter().push`）が呼ばれていないことを確認する（負の表明） | 既存 `AuthGuard.test.tsx:124-132`「未認証でも AuthGuard 自身はリダイレクトしない」と同じ `expect(mockPush).not.toHaveBeenCalled()` パターン（testing.md 2026-09-10 系の教訓が直接前例になっている、否定表明自体の書き方は確立済み）。ここでは「リダイレクトしない」に加えて「フォールバックUIが実際に描画される」ことも同時に確認するのが本シナリオの新規部分 |

**E2E判定:** No
**理由:** 判断ツリー Q1 = No。このフォールバックUIはナビゲーションを一切伴わない純粋な条件付きレンダー（`session`/`loading`/`authEnabled` という props/state 相当の入力に対する出力）であり、「DOM の確認が props/state の検証で代替できる → Frontend Unit で十分」（testing.md の代替条件）にそのまま該当する。`ssr-cookie-auth-phase-a` の S-5（/no-group への実ナビゲーションを伴う既存挙動）が E2E だったのは `router.push` による実際のブラウザ遷移を確認する必要があったためで、本シナリオは対照的にリダイレクトが**発生しないこと**が要件そのもの（Decision 2 の MUST NOT）なので、ブラウザでの遷移確認という E2E の強みが活きる場面ではない。「別タブでのサインアウトが実際に `useAuth().session` を `null` にする」という `AuthContext` の `onAuthStateChange` 配線自体は本 change が新設するものではなく（Phase A 以前から存在する既存の仕組み）、本 change が追加するのは `AuthGuard` 内の新しいレンダー分岐のみであるため、その配線の実ブラウザ再現（別タブでの実サインアウト操作を伴う E2E）まで本 change のテスト範囲に含める必要はないと判断した

---

#### S-5: loading 中はフォールバックUIを表示しない（既存 loading 分岐の維持）
**Given:** Supabase 認証が有効、`loading` が `true`、`session` が `null`
**When:** `AuthGuard` を render する
**Then:** フォールバックUI（「セッションが切れました」）も children も表示されない（既存の loading 中は何も表示しない分岐が優先される）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | 既存の「session も group も無く loading=true のとき children を表示しない」テスト（`AuthGuard.test.tsx:69-77`）を拡張し、children 不在に加えてフォールバックメッセージ（`queryByText("セッションが切れました")` 等）も存在しないことを確認する | 新しい3値分岐（`authEnabled && !loading && !session` → フォールバック）を追加したことで、既存の `loading: true` ケースを誤って巻き込んでいないかの回帰確認。design.md の Risk「既存の `AuthGuard.test.tsx` の各テストケースが新しい3値分岐と衝突しないか」に直接対応する |

**E2E判定:** No
**理由:** S-4 と同じ（Q1 = No、純粋な条件分岐の props/state 検証）

---

### JWKS キャッシュ（Decision 3）のテスト方針

Decision 3 は「認証済みリクエストごとの JWKS 再取得コストを削減する」ことが目的の**純粋なパフォーマンス最適化**であり、実装が正しく動く限りユーザーから観測可能な挙動の変化はない（キャッシュが無くても `getClaims()` はライブラリ内蔵の取得・キャッシュ経路にフォールバックし、認証結果自体は変わらない設計——design.md Decision 3）。この性質上、ハイブリッド形式の G/W/T シナリオ（ユーザー操作起点の Given/When/Then）を立てるのは不自然であり、`.claude/rules/testing.md` の代替条件「HTTP のリクエスト/レスポンスを検証したい（UI不要）→ Backend Unit / Integration」に相当する（ここでは Frontend 版として、キャッシュモジュール自体の入出力検証）に該当すると判断し、S-番号は振らず以下の Frontend Unit テスト群で担保する。

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`jwksCache.test.ts`、新規） | キャッシュが無い状態で呼ぶと fetch し `{ keys }` を返す | discovery endpoint（`{supabaseUrl}/auth/v1/.well-known/jwks.json`）への fetch をモック |
| Frontend Unit | TTL 内に2回呼ぶと fetch は1回しか実行されず、2回目もキャッシュされた `keys` を返す | `vi.useFakeTimers()` 等で時刻を固定した状態での呼び出し2回を比較 |
| Frontend Unit | TTL 経過後に呼ぶと再度 fetch が実行される | `vi.advanceTimersByTime()` で TTL（design.md 記載の想定 10分）超過後に呼び出し、fetch 回数が2回になることを確認 |
| Frontend Unit | fetch が失敗（reject、または非 200 レスポンス）した場合は例外を投げず `undefined` を返す | design.md「fetch 自体が失敗した場合は `undefined` を返し、呼び出し側は `jwks` オプションを渡さずに `getClaims()` を呼ぶ」の直接的な discriminator |
| Frontend Integration（`middleware.test.ts` の既存テスト拡張） | `getClaimsMock` の呼び出し引数を検証し、キャッシュが有効な `keys` を返すときは `getClaims(undefined, { jwks: { keys } })` の形で呼ばれ、キャッシュが `undefined` を返すときは `jwks` オプション無し（または `jwks: undefined`）で呼ばれることを確認する | 「JWKS キャッシュ機能が `middleware.ts` に正しく配線されているか」を保証するのはこのテストのみ。`jwksCache.ts` 単体のロジック（Frontend Unit 側）とは責務を分ける |

**E2E判定:** No
**理由:** 判断ツリー Q1 = No（キャッシュのロジックもその配線もブラウザ非依存で直接呼び出し検証できる）。加えて、実装が正しい限りキャッシュの有無はレスポンスの認証結果を一切変えない設計であるため、そもそも E2E で観測できる差分が存在しない。既存の `auth.spec.ts` の S-4〜S-6（未ログインリダイレクト・cookie 維持等）が本 change 後も green であり続けること自体が「JWKS キャッシュを組み込んでも認証が壊れていない」ことの間接的な regression 確認として機能するため、本 change のために新規 E2E を追加する必要はないと判断した。なお design.md の Trade-off（TTL 内に鍵がローテーションされ検証失敗した場合に `AuthInvalidJwtError` として誤って redirect されうる懸念）への対処（再フェッチのセーフティネット）が実装で必要と判断された場合は、そのセーフティネット自体は S-1〜S-3 と同じ Frontend Integration の枠組み（`getClaimsMock` の呼び出しシーケンスを検証）で追加すれば足り、これも E2E化は不要と考える
