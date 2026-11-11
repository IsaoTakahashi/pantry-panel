## Why

SSR の初回取得（`getInitialStockItems.ts`）は、Supabase クライアントを使わずに `frontend/src/lib/sessionCookie.ts` の `readAccessTokenFromCookies` でアクセストークンを取り出している（#308）。ここで読み取りに失敗すると初回表示が遅くなり、誤った値を返すと Go API の 401 を経由した強制ログアウトにつながる。にもかかわらず、既存テストは手で選んだ数例だけで、cookie の分割境界・マルチバイト文字・古い chunk の残りといった実際に起こる入力をほとんど試していない。プロパティベーステスト Epic（#316）の最初の Issue（#321）として、fast-check を導入し、この往復処理を網羅的に検証する。

## What Changes

- frontend に dev dependency として `fast-check` を追加する（このリポジトリで初めてのプロパティベーステスト）
- `buildSessionCookies` / `readAccessTokenFromCookies` に対するプロパティベーステストを追加する
  - 往復: 任意のセッションを分割して結合すると、元の `access_token` に戻る（chunk が 1 個・複数個の両方を確実に生成する）
  - 分割境界: `MAX_CHUNK_SIZE` の前後の長さでも往復が成り立つ
  - 旧形式: `base64-` 接頭辞のない生 JSON の cookie からも読み取れる
  - 混入: 無関係な cookie・別の project ref の cookie を混ぜても結果が変わらない。同じキーの分割されていない cookie と chunk が同時にあるときは、分割されていない方が使われる
  - 古い chunk・欠け: 末尾に古い chunk が残る、途中の chunk が欠ける場合に、正しいトークンか `null` のどちらかだけを返し（それ以外の文字列は返さない）、例外を投げない
  - 壊れた入力: base64 / JSON として不正な値、`access_token` が文字列でない、のいずれでも `null` を返し、例外を投げない
- プロダクションコードの振る舞いは変えない。テストで不具合が見つかった場合のみ修正し、その時点で spec を追加する

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

（なし）

テストの追加のみで、spec レベルの振る舞いは変わらないため、`.openspec.yaml` に `skip_specs: true` を設定する。

## Impact

- `frontend/package.json` / `package-lock.json`: `fast-check` を devDependencies に追加
- `frontend/src/lib/sessionCookie.property.test.ts`（新規）
- プロダクションコード・API・UI への影響なし。E2E の対象外

## ユーザーシナリオとテスト設計

### フロントエンドシナリオ

この change はテストの追加のみで、UI もプロダクションコードの振る舞いも変えない。以下のシナリオはすでに成り立っているはずの振る舞いで、それを `readAccessTokenFromCookies` / `buildSessionCookies` のプロパティとして押さえる。テストはすべて `frontend/src/lib/sessionCookie.property.test.ts`（Vitest + fast-check 4.10.2、`await fc.assert(fc.asyncProperty(...))`）に置く。

#### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | ログイン済みユーザーが /stock-items を開くと、セッションの大きさ（cookie が 1 個か複数 chunk か）に関係なく、SSR が cookie からアクセストークンを読み取り、初期表示に在庫が入る | - | Unit |
| S-2 | 旧形式（`base64-` 接頭辞のない生 JSON）の cookie が残っているユーザーでも、SSR がアクセストークンを読み取れる | - | Unit |
| S-3 | ブラウザに無関係な cookie・別の Supabase プロジェクトの cookie・同じキーの分割されていない cookie と chunk が同時にあっても、SSR は正しい cookie からトークンを選ぶ | - | Unit |
| S-4 | cookie が壊れている、古い chunk が残っている、chunk が欠けているときでも、SSR は例外で落ちず、別のトークンも使わず、クライアント側の取得にフォールバックする | - | Unit |

#### S-1: セッションの大きさに関係なく、SSR がアクセストークンを読み取る
**Given:** ログイン済みで、`buildSessionCookies` と同じ形式（`base64-` + base64url(JSON)）のセッション cookie を持っている。`user_metadata` が大きい（日本語・絵文字を含む）と、cookie は `sb-{ref}-auth-token.0`、`.1`、… に分割されている
**When:**  /stock-items を開き、`getInitialStockItems` が `readAccessTokenFromCookies` でトークンを読む
**Then:**  元のセッションの `access_token` と同じ文字列が返り、それを使って在庫を取得する

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | **往復**: 任意の project ref・JWT 形式の `access_token`・Unicode 全域の文字列を含む `user_metadata`・長さを指定したパディングから作ったセッションについて、`readAccessTokenFromCookies(url, buildSessionCookies(url, session) を引く関数)` が `session.access_token` と一致する | project ref は英小文字と数字のラベル（`new URL()` が例外を投げない範囲）。不正な URL は対象外（design.md） |
| Frontend Unit | **MAX_CHUNK_SIZE の境界**: cookie 値の長さが `MAX_CHUNK_SIZE`（3180）の倍数の前後になるセッションでも往復が成り立つ。境界のすぐ内側（1 chunk、例: 3179）と外側（2 chunk、例: 3181）の両方が実際に生成されていることもテストの中で確認する | `stringToBase64URL` はパディングを出力しないため、base64url の長さを 4 で割った余りは 1 にならない。cookie 値は `base64-`（7 文字）+ base64url なので、長さが 4 の倍数の値は作れない。3180 の倍数はどれも 4 の倍数なので、長さがちょうど `k*3180` の値は `buildSessionCookies` からは生成できない。そのため、長さが狙った値ちょうどであることは要求しない。境界の両側で実際に到達できる最も近い長さを狙う |
| Frontend Unit | **マルチバイト文字**: 日本語・絵文字を含むセッションでも往復が成り立つ | `base64-` 形式の cookie 値は ASCII だけなので、マルチバイト文字は長さを変えるだけで、`createChunks` の `%` エスケープ・Unicode 境界の分岐は通らない。その分岐は S-2 の生 JSON で検証する |
| Frontend Unit（既存） | 単一 cookie・複数 chunk の往復、cookie なしで `null`（`sessionCookie.test.ts`） | 例ベースのテストは残す |

**E2E判定:** No
**理由:** Q1 で No。`readAccessTokenFromCookies` は cookie を引く関数を引数で受け取る純粋な関数で、ブラウザを起動しなくても入力を自由に作れる。単一 cookie の正常系は、既存の `e2e/ssr-stock-items.spec.ts`（mock project）が、本物のブラウザ・middleware・SSR を通して JS 無効の初期 HTML に在庫が載ることまで確認している。複数 chunk や境界の長さを E2E で作るには storageState を手で組み立てる必要があるが、それで増える確認は chunk の分割・結合だけで、Unit のプロパティの方がはるかに多くの入力を試せる。

---

#### S-2: 旧形式（生 JSON）の cookie からもアクセストークンを読み取る
**Given:** 以前の `@supabase/ssr` が書いた、`base64-` 接頭辞のない生 JSON のセッション cookie を持っている（分割されていない場合と、分割されている場合がある）
**When:**  /stock-items を開き、SSR がトークンを読む
**Then:**  生 JSON の `access_token` が返る

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | **旧形式・分割なし**: 任意のセッションの `JSON.stringify(session)` を、分割されていないキーの値として渡すと、`session.access_token` が返る | JSON は `{` で始まるため、`base64-` 接頭辞と取り違えることはない |
| Frontend Unit | **旧形式・分割あり**: Unicode を多く含む大きなセッションの生 JSON を `createChunks` で分割した cookie からも、`access_token` が返る | 生 JSON は URI エンコードで長さが変わるため、ここで初めて `createChunks` の `%` エスケープ・Unicode 境界での分割の分岐を通る。`buildSessionCookies` は使わない（生 JSON を作る経路がないため）。テストの組み立てに `createChunks` を直接使う。`base64-` 形式では作れない、cookie 値の長さがちょうど `MAX_CHUNK_SIZE` の倍数になるケースもここで生成する（S-1 の境界の補完） |

**E2E判定:** No
**理由:** Q1 で No。旧形式の cookie は E2E の global-setup では作らず、ブラウザで再現する手段も持たない。値の変換だけの問題なので、Unit で十分。

---

#### S-3: 他の cookie が混ざっていても、正しい cookie からトークンを選ぶ
**Given:** S-1 の cookie に加えて、無関係な名前の cookie、別の project ref の `sb-{other}-auth-token`（とその chunk）、または同じキーの分割されていない cookie と `.N` の chunk が同時にある
**When:**  SSR がトークンを読む
**Then:**  混入による影響を受けず、`combineChunks` の規則で決まる cookie からトークンを返す

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | **無関係な cookie・別の project ref の cookie**: これらを足しても、結果は足す前と同じ（`access_token` が一致する）。例外も投げない | 別の project ref の生成器は、対象の ref と一致しないように `filter` する。名前の完全一致で引くため構造上は明らかで、安価な確認として置く（網羅性の根拠にはしない、design.md 4.） |
| Frontend Unit | **分割されていない cookie の優先**: 同じキーに、セッション A の分割されていない cookie と、セッション B の `.0`、`.1`、… が同時にあるとき、A の `access_token` が返る | `combineChunks` は分割されていない `key` に値があればそれを返す。この優先順位はライブラリの中にあるため、アプリのコードを壊すミューテーションでは検証できない（下記「テストの有効性確認」） |

**E2E判定:** No
**理由:** Q1 で No。cookie を引く関数に入れる値の組み合わせだけで決まる。ブラウザで混入状態を作っても、確認できることは増えない。

---

#### S-4: cookie が壊れていても SSR は落ちず、クライアント側の取得にフォールバックする
**Given:** 次のどれかの状態にある
- 以前の大きなセッションの古い chunk（`.N`）が末尾に残っている
- 途中の chunk（`.0` を含む）が欠けている
- cookie 値が任意の文字列、base64url / JSON として不正な値、または空文字である
- JSON の `access_token` が文字列でない（数値・`null`・オブジェクト・配列）か、欠けている

**When:**  SSR がトークンを読む
**Then:**  例外を投げずに `null` を返す（古い chunk・欠けの場合は、正しいトークンが返ることもある）。`getInitialStockItems` は `null` を受けて Go API を呼ばずに `null` を返し、クライアント側の `useStockItems` が通常の取得にフォールバックする

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | **古い chunk・欠け**: セッション S の chunk に対して、末尾に古い `.N` を足す、または途中の `.i` を取り除くと、結果は `S.access_token` か `null` のどちらかで、**それ以外の文字列は返らない**。例外も投げない | Why にあるとおり、誤った値を返すと Go API の 401 を経由して強制ログアウトにつながる。そのため、厳密な値は期待しないが、「別の文字列を返さない」ことは要求する（design.md 4. の「正しいトークン or null」を強めた書き方）。古い chunk に、以前のセッションの `access_token` を返す余地がないことの確認も兼ねる |
| Frontend Unit | **壊れた入力**: 分割されていないキーの値が任意の文字列（`fc.string` に Unicode も含める）、`base64-` + 任意の文字列、base64url としては正しいが JSON として不正な値のとき、`null` を返し、例外を投げない（`await` が reject しない） | 任意の文字列がたまたま正しいセッション JSON になることはまずないが、なった場合に備えて、期待値は「`null`、または `access_token` を正しく取り出せた文字列」としてもよい。決め方は実装時に判断する |
| Frontend Unit | **`access_token` が文字列でない**: `access_token` を数値・`null`・オブジェクト・配列・欠落に置き換えたセッション（`base64-` 形式・生 JSON の両方）で、`null` を返す | `typeof accessToken === "string"` の判定を押さえる |
| Frontend Unit（既存） | `null` を受けた `getInitialStockItems` が `fetchStockItems` を呼ばずに `null` を返す（`getInitialStockItems.test.ts`「auth-token cookie が無いとき」「cookie の値が不正(JSON parse失敗)のとき」） | 今回は変更しない。フォールバックのつなぎ目は既存のテストで押さえ済み |

**E2E判定:** No
**理由:** Q1 で No。壊れた cookie の扱いは `readAccessTokenFromCookies` の中で完結する。`null` を受けたあとクライアント取得にフォールバックする経路は、既存の Unit（`getInitialStockItems.test.ts`）と、`useStockItems.test.ts`「initialItems が null のとき、従来通り fetchStockItems が呼ばれる」ですでに押さえている。壊れた cookie をブラウザに入れる E2E を足しても、これらのつなぎ目以上のことは確認できない。

---

#### テストの有効性確認（全シナリオ共通）

プロパティが緑であることだけでは、生成器が分割の経路を通っていない、あるいは実装が壊れても気づかない、という可能性を排除できない。そこで次の 2 点を確認する。

| 確認 | 方法 | 合格の条件 |
|-----|------|-----------|
| **生成器が複数 chunk のケースを実際に生成していること** | S-1 の生成器から `fc.sample` で一定数（例: 200 件）を取り出し、`buildSessionCookies` の chunk 数を数える。`fc.statistics` は分布を出力するだけで失敗しないため、分布の確認に使うだけにとどめ、合否は `expect` で判定する | chunk が 1 個のもの、2 個以上のもの、境界のすぐ内側・外側の長さのものが、それぞれ 1 件以上ある（3 個以上も安価に出せるなら含める）。生成器が短い文字列に戻ってしまった場合は、このテストが失敗する |
| **ミューテーション（実装を一時的に壊すとプロパティが落ちること）** | `sessionCookie.ts` を下表のように一時的に書き換え、`npm test` で該当のプロパティが落ちることを確かめてから元に戻す。書き換えはコミットしない。結果は PR に記載する（tasks.md 4.1） | 下表の「落ちるべきプロパティ」がすべて落ちる |

| ミューテーション | 落ちるべきプロパティ | 落ちないはずのもの（区別できていることの確認） |
|----------------|-------------------|------------------------------------------|
| `base64-` 接頭辞を除去しない（`raw` をそのまま `stringFromBase64URL` に渡す、または接頭辞付きのまま JSON.parse する） | S-1 往復・境界（すべてのケース） | S-2 旧形式は通る（接頭辞の有無で処理を分けていることの確認） |
| 接頭辞の有無を見ずに、常に先頭 7 文字を除いて base64url としてデコードする | S-2 旧形式 | S-1 往復は通る |
| 結合後の文字列を切り詰める（例: `raw.slice(0, MAX_CHUNK_SIZE)`） | S-1 往復のうち複数 chunk のケース | S-1 の 1 chunk のケースは通る（生成器が複数 chunk のケースを出していることの裏付け） |
| `typeof accessToken === "string"` の判定を外す | S-4 `access_token` が文字列でない | — |
| デコード・JSON.parse を囲む try/catch を外す | S-4 壊れた入力（例外を投げない） | — |

S-3 の「分割されていない cookie の優先」は `@supabase/ssr` の `combineChunks` の中で決まるため、アプリのコードを書き換えるミューテーションでは確かめられない。ライブラリの挙動が変わったときに落ちる回帰テストとして置く。

**実行時間:** 大きな入力を生成するため、`numRuns` をプロパティごとに調整し、ファイル全体を数秒以内に収める（design.md Risks）。失敗した場合は、fast-check が出力する seed と縮小済みの反例を例ベースのテストとして `sessionCookie.test.ts` に固定する。

---

### バックエンドシナリオ

#### サマリ
バックエンドシナリオは無し。この change は frontend のテストの追加のみで、Go API・DB・API 契約に変更がない。
