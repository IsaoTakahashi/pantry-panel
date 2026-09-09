# e2e-design: ssr-cookie-auth-phase-a

`.claude/rules/testing.md` の基準（シナリオ6件以上）により `proposal.md` から切り出し。

### フロントエンドシナリオ

#### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | 通常ログインで /stock-items に到達する | - | Frontend Unit / Integration |
| S-2 | 招待リンク（/join）経由のログインで元の URL に戻る | - | Frontend Unit / Integration |
| S-3 | コード交換失敗時にエラー付きで /login に戻る | - | Frontend Unit / Integration |
| S-4 | 未ログインで保護ルートにアクセスすると middleware が /login へリダイレクトする | Mock | E2E |
| S-5 | 認証済み・グループ未所属のとき AuthGuard が /no-group へリダイレクトする（既存挙動の回帰確認） | Mock | E2E |
| S-6 | cookie セッションがリロード・ページ遷移をまたいで維持される | Mock | E2E |
| S-7 | 有効なセッション cookie を持つリクエストで middleware がセッションをリフレッシュする | - | Frontend Integration |
| S-8 | セッションリフレッシュが失敗してもリクエストがブロックされない（fail open） | - | Frontend Integration |

補足: S-1〜S-3、S-7〜S-8 は「実際に Google の同意画面を操作してログインを完了する」部分、または「middleware 内部のサーバー間通信」を含まない（後述の理由により E2E 対象外と判断）。この5件は Frontend Unit / Integration のみで契約を担保し、環境列は「-」とする。

シナリオ数は6件を超えており、`.claude/rules/testing.md` の「シナリオが6件以上になる場合は `e2e-design.md` に切り出す」原則には本来抵触する。今回はこのテスト設計 sub-agent の作業指示が proposal.md 以外のファイル変更を禁じていたため、切り出しは行わずインラインに収めた。分割の要否は呼び出し元エージェント・レビュー時に判断すること。

---

#### S-1: 通常ログインで /stock-items に到達する
**Given:** 未ログイン状態で `/login` を開いている
**When:** 「Googleでサインイン」をクリックし、Google 認可・`/auth/callback?code=xxx&next=%2Fstock-items` へのリダイレクト・コード交換が成功する
**Then:** `/auth/callback` がセッション cookie を書き込み、`/stock-items` へリダイレクトされる

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | `login/page.tsx` の「Googleでサインイン」クリックで `signInWithGoogle()`（`AuthContext`）が呼ばれ、`redirectTo` が `/auth/callback` 経由・`next=/stock-items` を含む形で組み立てられることを確認する（`signInWithOAuth` をモック） | 既存の `AuthContext` テストパターンを踏襲 |
| Frontend Integration | `app/auth/callback/route.ts` の `GET` ハンドラを直接呼び出し（`NextRequest` を組み立てて渡す、サーバー起動不要）、`exchangeCodeForSession` が成功（モック）した場合に `next` へ 302/307 リダイレクトし `Set-Cookie` が付与されることを確認する | Next.js の Route Handler はプレーンな async 関数であり、ブラウザなしで直接呼び出して検証できる |

**E2E判定:** No
**理由:** 実際に Google の同意画面を操作して有効な PKCE `code` を得る手順は、CI 上での bot 対策・テスト用 Google アカウント運用のコストから現実的でない（既存 `frontend/e2e/global-setup.ts` が同じ理由で実 OAuth UI 操作を避け、Supabase の password grant でセッションを直接発行している前例と同じ判断）。`app/auth/callback/route.ts` のリダイレクト・cookie 書き込みロジック自体はブラウザ非依存（判断ツリー Q1 = No）なので Frontend Integration で十分。cookie セッション確立後に保護ページへ実際に到達・維持できることは S-6 で確認するため、ここでの重複した E2E は設けない

---

#### S-2: 招待リンク（/join）経由のログインで元の URL に戻る
**Given:** 未ログイン状態で `/join?token=xxx` を開いている
**When:** 「Googleでサインインして参加する」をクリックし、`/auth/callback?code=xxx&next=%2Fjoin%3Ftoken%3Dxxx` を経由してコード交換が成功する
**Then:** セッション cookie が書き込まれ、`/join?token=xxx`（招待トークンを保持したまま元の URL）へリダイレクトされる

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | `join/page.tsx` の「Googleでサインインして参加する」クリックで `signInWithGoogle(window.location.href 相当)` が呼ばれ、`next` に現在の `/join?token=xxx` がエンコードされて渡ることを確認する | 既存 `join/page.tsx` の `redirectTo` 独自指定ロジックが、コールバックルート経由でも保たれることの確認 |
| Frontend Integration | S-1 と同じ `GET` ハンドラ直接呼び出しテストを、`next=/join?token=xxx` の場合で確認する（成功パスの一般化） | S-1 のテストとハンドラは共通、`next` 値のバリエーションのみ追加 |

**E2E判定:** No
**理由:** S-1 と同様、実 Google 認可の自動化が現実的でない。「元の URL に戻る」という本シナリオの核心（`next` パラメータの往復）は、実際には Route Handler の純粋なリダイレクト先決定ロジックであり、ブラウザなしで Frontend Integration により確定的に検証できる

---

#### S-3: コード交換失敗時にエラー付きで /login に戻る
**Given:** `/auth/callback` に無効・期限切れの `code` でアクセスされる状態
**When:** ハンドラが `exchangeCodeForSession(code)` を呼び、これが失敗する
**Then:** エラー情報を伴って `/login` へリダイレクトされる

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | `GET` ハンドラを直接呼び出し、`exchangeCodeForSession` が reject（モック）した場合に `/login`（エラー用クエリパラメータ等）へのリダイレクトになることを確認する | S-1/S-2 と同じハンドラの失敗パス |
| Frontend Unit | `/login` page がエラー用クエリパラメータを受け取った場合にエラーメッセージを表示することを確認する | 本 change で `login/page.tsx` に追加が必要になる新規表示ロジック |

**E2E判定:** No
**理由:** Playwright の `page.route()` によるネットワークインターセプトはブラウザ（ページ）側が発行するリクエストのみを対象とし、Route Handler がサーバー側（Node プロセス）で Supabase に対して行う `exchangeCodeForSession` 呼び出しは対象にできない。そのため E2E では失敗を確定的に再現できず、Frontend Integration で `exchangeCodeForSession` を直接モックする方が制御可能かつ安定する。実 Supabase に不正な `code` を渡した際の実際の失敗挙動を Preview で追加確認する価値はあるが、本 change の必須スコープには含めない（将来の任意強化として残す）

---

#### S-4: 未ログインで保護ルートにアクセスすると middleware が /login へリダイレクトする
**Given:** セッション cookie を持たない（未ログインの）ブラウザ
**When:** 保護ルート（例: `/stock-items`）へ直接アクセスする
**Then:** クライアント側 JS の実行を待たずに `/login` へリダイレクトされる

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | `browser.newContext({ javaScriptEnabled: false })` で JS を無効化したコンテキストから保護ルートへ `page.goto()` し、最終 URL が `/login` になることを確認する | JS 無効下では旧 `AuthGuard` の `useEffect` ベースの client-side リダイレクトは原理的に発火し得ない。それでもリダイレクトが起きることは、リダイレクトが middleware（サーバー側）由来であることの直接証明になり、Decision 3（「未ログイン→/login」の判定を `AuthGuard` から middleware へ移管した）が実装されたことの discriminator として機能する |
| E2E Mock（回帰） | 通常の JS 有効コンテキストでも同一シナリオが `/login` に到達することを確認する | こちらは server/client いずれの経路かを区別しない素朴な回帰確認 |

**E2E判定:** Yes
**理由:** ブラウザのナビゲーション結果そのものを検証する必要があり（判断ツリー Q1 = Yes）、外部 API 依存はない（Q2 = No）ため Mock。JS 無効化コンテキストを主たる discriminator として採用する

**実装時の確認事項:** `testing.md` の更新ログ（2026-06-17 の一般化基準3、2026-09-04 の冗長二重保証の教訓）に倣い、この JS 無効化アサーションを実装した際は、本 change 適用前のコード（`AuthGuard` が未ログインリダイレクトを担っていた旧実装）に対して同じテストを実行すると red になることを一度確認する。「JS を無効化しても通ってしまう」ようであれば、このテストは discriminator として機能しておらず、別の検証方法を検討する

---

#### S-5: 認証済み・グループ未所属のとき AuthGuard が /no-group へリダイレクトする（既存挙動の回帰確認）
**Given:** 有効なセッション cookie を持つが、所属 group が0件のユーザー
**When:** 保護ルート（例: `/stock-items`）へアクセスする
**Then:** middleware は通過するが、`AuthGuard` がクライアント側で `/no-group` へリダイレクトする

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | backend `/api/groups/me` を空配列で stub し、`/stock-items` へアクセスすると最終的に `/no-group` へ遷移することを確認する | middleware 通過後に client-side で group 判定が行われる一連の流れをブラウザ挙動として確認する |
| Frontend Unit（既存・維持） | `AuthGuard.test.tsx` の「認証済み・グループ未所属のとき /no-group へリダイレクトする」は既存のまま残る | `auth-guard` spec の Requirement 文言は変わるが（未ログイン判定の削除）、この group 未所属シナリオ自体の期待値は無変更。既存テストがそのまま regression として機能することを実装 task で確認する |
| Frontend Unit（**削除対象**） | `AuthGuard.test.tsx:124-132`「未認証のとき /login へリダイレクトする」（`session: null` → `mockPush` に `/login` が呼ばれることを期待）は本 change の MODIFIED 要件（`AuthGuard` は未ログインリダイレクトを行わない MUST NOT）と矛盾するため**削除**する | 削除だけでは「retreat」になるため、代わりに逆方向のアサーション（`session: null` の状態で `AuthGuard` を render → `mockPush` が `/login` を引数に**呼ばれない**こと）を追加する。これが Decision 3 の unit レベルの discriminator であり、S-4 の E2E discriminator（middleware 由来であることの証明）と対になる |

**E2E判定:** Yes
**理由:** middleware を通過した後にクライアント側 JS が group 判定・リダイレクトを行うという一連の流れは、ブラウザでの実際の遷移として確認する必要がある（判断ツリー Q1 = Yes）。外部 API は backend の REST CRUD のみのため Mock

---

#### S-6: cookie セッションがリロード・ページ遷移をまたいで維持される
**Given:** 有効なセッション cookie を持つ認証済みユーザー（E2E fixture により注入）
**When:** 保護ページをリロードする、または別の保護ページへナビゲーションする
**Then:** 再度 `/login` へ飛ばされず認証状態が維持される。また `localStorage` にセッション関連のキーが存在しない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | `page.reload()` 後・別保護ページへの `page.goto()` 後のいずれでも `/login` へリダイレクトされず、ページ内容が表示され続けることを確認する | cookie ベースのセッションが localStorage ベースと異なりリクエストヘッダで自動送信されることに由来する、本 change の中心的な振る舞いの変化 |
| E2E Mock | `page.evaluate(() => Object.keys(localStorage))` でセッション関連キー（`sb-*-auth-token` 等）が存在しないことを確認する | `ssr-session-auth` spec の「サインイン後、セッションが cookie に保存される」Requirement のうち `localStorage` 不使用の部分に対応する regression 確認 |

**E2E判定:** Yes
**理由:** cookie がページリロード・ナビゲーションをまたいで実際にブラウザから送信され続けることは、ブラウザの実際の cookie 送信挙動でしか確認できない（判断ツリー Q1 = Yes）。外部 API 依存はない（Q2 = No）ため Mock

---

#### S-7: 有効なセッション cookie を持つリクエストで middleware がセッションをリフレッシュする
**Given:** 有効なセッション cookie を持つリクエストが `middleware.ts` に到達する
**When:** middleware がセッションリフレッシュ処理を実行し、成功する
**Then:** レスポンスに更新後のセッション cookie が `Set-Cookie` される。ページ本体のレンダリングはブロックされない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | `middleware.ts` のエクスポート関数を `NextRequest` を組み立てて直接呼び出し、サーバークライアントのリフレッシュ処理が成功（モック）した場合に返される `NextResponse` に `Set-Cookie` が付与されていることを確認する | `middleware.ts` もプレーンな関数であり、ブラウザ・実サーバー起動なしで直接呼び出して検証できる（S-1〜S-3 の Route Handler 直接呼び出しパターンと同様） |

**E2E判定:** No
**理由:** リフレッシュ処理自体は middleware がサーバー側で Supabase に対して行う通信であり、S-3 と同じ理由（Playwright の `page.route()` はブラウザ発のリクエストしか対象にできない）で E2E から確定的に制御できない。`NextRequest`/`NextResponse` を直接扱う Frontend Integration の方が制御可能かつ安定する

---

#### S-8: セッションリフレッシュが失敗してもリクエストがブロックされない（fail open）
**Given:** セッションリフレッシュ処理が一時的な障害（Supabase 側のエラー等）で失敗する状況
**When:** `middleware.ts` がこのリクエストを処理する
**Then:** リフレッシュ失敗にもかかわらずリクエストはブロックされず、後続のページレンダリングに進む（保護ルートであってもリフレッシュ失敗だけを理由に `/login` へリダイレクトされない）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | S-7 と同じ直接呼び出しで、サーバークライアントのリフレッシュ処理が reject（モック）した場合でも、返される `NextResponse` が（有効なセッション cookie が存在する限り）`NextResponse.redirect` ではなく `NextResponse.next()` 相当になることを確認する | `ssr-session-auth` spec の「リフレッシュ失敗時もリクエストを継続する」（MUST、fail open）の直接的な discriminator。この保証を落とすと、Supabase 側の一時的な障害がユーザー全員のログアウトを引き起こす重大リグレッションになるため優先度が高い |

**E2E判定:** No
**理由:** S-7 と同様、middleware のサーバー間通信の失敗を E2E から確定的に注入する手段がない。Frontend Integration でリフレッシュ処理を直接 reject させる方が確実

---

### バックエンドシナリオ

本 change はバックエンドのコードに影響しない（Impact 参照: backend は引き続き `Authorization: Bearer <token>` の JWT を JWKS で検証するのみであり、認証方式の変更はセッションの保存場所（cookie vs localStorage）と OAuth コールバックの経路という Next.js 側の関心事に閉じている）。したがって **バックエンドシナリオのセクションは設けない**（`delete-e2e-groups` change がフロントエンドシナリオのセクションを設けなかったのと対称の判断）。

---

### `frontend/e2e/global-setup.ts` の書き換えについて（テスト非対象の判断・ただし影響範囲の注記あり）

本 change は `frontend/e2e/global-setup.ts` の storageState 生成ロジックを、localStorage ベースのセッション注入（`storageState.origins[].localStorage` に `sb-{project-ref}-auth-token` を書き込む現行方式）から、cookie ベースのセッション注入（`storageState.cookies` に Supabase セッション cookie を書き込む方式）へ書き換える必要がある。

この書き換え自体には、`delete-e2e-groups`（`global-teardown.ts` への `DELETE /api/groups/:id` 呼び出し追加）の前例と同様、専用の自動テストシナリオは設けない。プロダクトコードではなく E2E テストインフラの変更であるため。

ただし、今回は `delete-e2e-groups` の前例と性質が異なる点を明記する:
- `delete-e2e-groups` の変更は既存の後片付け処理に1呼び出しを追加する **加算的・独立** な変更であり、他のテストの成否には影響しなかった
- 本 change の `global-setup.ts` 書き換えは、`playwright.config.ts` の `mock` / `preview` 両 project が共通で参照する `storageState: ".auth/user.json"` の **中身の形式そのもの** を変える。この storageState は `filter.spec.ts` / `stock-items.spec.ts` / `url-registration.spec.ts` / `image-selection.spec.ts` / `realtime-sync.spec.ts` を含む **既存 E2E スイート全体の認証前提** であり、cookie 形式への書き換えが不完全・不正確だと、これら全ての既存テストが「そもそもログイン状態にならない」という形で一斉に失敗しうる

専用シナリオを設けないという結論自体は変えないが、この非対称性を踏まえ、tasks.md には少なくとも以下を含めることを推奨する（本セクションの執筆者は tasks.md の編集権限を持たないため、ここに提案として記録するのみに留める）:
- [ ] `global-setup.ts` の cookie 書き換え後、`npx playwright test`（mock project）で新規シナリオ（S-4〜S-6）だけでなく **既存スイート全体**（filter / stock-items / url-registration / image-selection / realtime-sync）が green であることを確認する
- [ ] preview project についても同様にフルスイートを一度確認する

**人間のレビューへのフラグ**: `global-setup.ts` のこの書き換えは、単一の change 内で完結する変更ではあるが、**既存 E2E スイート全体の認証基盤を一斉に置き換える** という点でブラスト半径が大きい。実装 sub-agent に委譲する際は「新機能の E2E を1つ追加するタスク」ではなく「全既存 E2E の前提を壊さずに移行するタスク」として明示的にスコープを伝えるべきである。

加えて、実装 task で確認すべき技術的な難易度要因として: `@supabase/ssr` はセッション cookie を単一の値としてではなく複数チャンク（例: `sb-{project-ref}-auth-token.0`, `.1` ...）に分割して保存する場合がある。`global-setup.ts` で `storageState.cookies` を手で組み立てる場合、単一の localStorage キーをコピーするだけだった現行実装より難度が上がる（正しいチャンク分割に加え、`path`/`sameSite`/`httpOnly`/`secure` 属性も実際に middleware が読める形で再現する必要がある）。実装が困難な場合は、design.md の Risk 4（動的 import と `@supabase/ssr` の非典型構成に関するエスカレーション基準）と同様に、早期に controller へエスカレーションすべき対象として扱うことを推奨する。
