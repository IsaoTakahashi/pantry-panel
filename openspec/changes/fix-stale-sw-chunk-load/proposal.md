## Why

モバイルで `/stock-items` を開くと、スケルトン表示のままデータがロードされない事象が発生している。プライベートタブ（Service Worker 非登録）では再現しないことから、root cause は **Service Worker のキャッシュ戦略**にある。新しい Vercel デプロイ後、SW が「最初の訪問時点の古い shell HTML（`/stock-items` を `revision: null` で pre-cache）」を返し、その HTML が参照する古い `_next/static/chunks/*.js` は origin から削除済みのため 404 → 遅延読み込み（Suspense）が解決できず ChunkLoadError でスケルトンのまま固まる。

## What Changes

- **shell HTML の pre-cache を見直す**: `/stock-items` を `revision: null` で pre-cache するのをやめ、デプロイをまたいで古い chunk ハッシュを参照する HTML が永久に残らないようにする
- **document のランタイムキャッシュ戦略を StaleWhileRevalidate → NetworkFirst に変更**する。オンライン時は常に最新 HTML（=有効な chunk ハッシュ）を取得し、オフライン時のみキャッシュにフォールバックする
- **ChunkLoadError からの自己回復を追加**する: chunk 読み込み失敗を検知したら、キャッシュ削除＋SW 解除のうえ一度だけリロードする（無限ループ防止のガード付き）。すでに壊れた状態で固まっている既存端末を次回アクセスで救済する **BREAKING**（SW ランタイム挙動の変更）
- 既存の SW spec（`frontend-pwa`）のうち、staleness を生む要件（shell HTML pre-cache / document = StaleWhileRevalidate）を更新する

## Capabilities

### New Capabilities

（なし。既存 capability の要件変更で対応する）

### Modified Capabilities

- `frontend-pwa`: Service Worker のキャッシュ戦略を変更する。具体的には (1) `/stock-items` shell HTML の pre-cache（`revision: null`）を削除、(2) document destination のランタイム戦略を StaleWhileRevalidate から NetworkFirst へ変更、(3) ChunkLoadError 検知時の自己回復（cache 削除＋SW 解除＋一度きりリロード）を新規追加

## Impact

- `frontend/next.config.ts`: `additionalPrecacheEntries` から `/stock-items` を除外
- `frontend/src/sw.ts`: document destination の handler を NetworkFirst に変更
- `frontend/src/`: ChunkLoadError を検知して自己回復するクライアント側ロジックを追加（例: `ServiceWorkerRegister` 近辺、または専用ユーティリティ）
- `frontend/src/sw.config.test.ts` / `sw.precache.test.ts`: 戦略・pre-cache 内容のテストを更新
- 新規テスト: ChunkLoadError 自己回復の unit テスト
- オフライン初回ナビゲーション挙動が変わる（pre-cache 即時表示 → NetworkFirst：初回オンライン取得後はキャッシュで動作）

## ユーザーシナリオとテスト設計

本変更は大部分が Service Worker / インフラ挙動のため、観察可能な振る舞い（デプロイ後の固まり防止・オフライン挙動・壊れた端末の自己回復）でフロントエンドシナリオを立て、キャッシュ戦略の単体検証を「SW 契約シナリオ」として分ける。テストピラミッドに従い unit を厚く、E2E は既存 `sw` project の S-8 を**更新**するに留めて net-new E2E をゼロに保つ。

### フロントエンドシナリオ（観察可能な挙動）

#### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | 新デプロイ後にモバイルで再訪してもスケルトンで固まらない（document=NetworkFirst でオンライン時は常に最新 HTML を取得） | Mock(sw project) | E2E（既存 S-8 を更新） |
| S-2 | オフライン時に shell HTML がキャッシュからフォールバックで出る | -（環境制約により unit/契約で代替） | Unit / SW契約 |
| S-3 | 壊れた SW を持つ端末が ChunkLoadError を検知して自己回復する（キャッシュ削除＋SW 解除＋一度きりリロード） | - | Unit |
| S-4 | 回復リロードは1セッション1回に制限され無限ループしない | - | Unit |

#### S-1: 新デプロイ後の再訪でスケルトン固まりが起きない
**Given:** SW が登録済みで、過去デプロイ時の shell HTML がキャッシュに残っている端末
**When:**  新デプロイ後、オンラインで `/stock-items`（E2E では制御可能な `/health`）へ再ナビゲーションする
**Then:**  キャッシュの古い HTML ではなく**ネットワークの最新 HTML が描画**され、成功時はその内容でキャッシュが更新される。古い chunk ハッシュを参照する HTML が返らないため Suspense が解決し、スケルトンで固まらない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock (`sw` project) | `e2e/service-worker.spec.ts` の **S-8 を SWR→NetworkFirst 仕様に書き換える**。キャッシュに合成 v1 HTML を植えた上でオンライン再訪すると、植えた v1 ではなく**ネットワークの実 HTML が描画**され、キャッシュも実 HTML で上書きされることを確認（CacheFirst なら v1 が残る／SWR なら v1 が一旦描画される、で判別できる） | 既存 S-8 は SWR を前提に「植えた v1 が即描画される」をアサートしている。本変更で**そのアサートは逆転**する。net-new な spec は追加しない |
| Frontend Unit (`sw.config.test.ts`) | document destination の handler が `NetworkFirst` であること（後述 C-1） | — |

**E2E判定:** Yes（ただし net-new ではなく既存 S-8 の**更新**）
**理由:** ブラウザの実 SW を介したランタイム戦略（オンライン時にネットワーク HTML が勝つか）はブラウザを起動しないと検証できない（判断ツリー Q1=Yes）。外部 API は不要なので Mock（`sw` project, `serviceWorkers: "allow"`）。重要なのは「E2E が不要」ではなく、**既存 S-8 が旧 SWR 挙動を誤ってアサートし続けないよう更新が必須**であること。新規 E2E を増やさないのでピラミッドは薄いまま。

---

#### S-2: オフライン時に shell HTML がキャッシュへフォールバックする
**Given:** 一度オンラインで取得し document キャッシュが温まった端末
**When:**  オフラインで `/stock-items` をリクエストし、ネットワーク取得が失敗する
**Then:**  キャッシュ済 HTML が返る（NetworkFirst のフォールバック leg）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit / SW契約 (`sw.config.test.ts`) | document handler が `NetworkFirst`（C-1）であれば、ネットワーク失敗時にキャッシュへフォールバックする挙動はライブラリ保証。ソース検証で handler 種別を担保 | NetworkFirst の本質はライブラリ実装。独自実装ではないので戦略選択を検証すれば十分 |
| E2E Mock (`sw` project) | （任意・低優先）オフライン強制でのフォールバックは Playwright の `context.setOffline` で再現可能だが SW fetch interception の制約があり高コスト。S-1 の更新スコープに含めず、フォールバックは戦略選択の検証で代替する | — |

**E2E判定:** No
**理由:** オフライン時のキャッシュフォールバックは NetworkFirst（ライブラリ実装）の標準挙動であり、独自ロジックを持たない。検証すべきは「戦略が NetworkFirst であること」のみで、これはソース検証 unit（C-1）で代替できる（判断ツリー：API レスポンス形式が固定＝ライブラリ挙動が固定、より小さいスコープで十分）。実 SW のオフライン挙動を E2E で確認するのは高コスト・低価値。

---

#### S-3: ChunkLoadError 検知時の自己回復
**Given:** 本番ビルドで、まだ当該セッションで回復を試行していない端末
**When:**  遅延読み込みされる JS チャンクの取得に失敗し ChunkLoadError 相当のエラー（`error.name === "ChunkLoadError"` もしくはメッセージに `Loading chunk` / `dynamically imported module` を含む）が `window` の `error` / `unhandledrejection` で発火する
**Then:**  `caches.keys()` の全キャッシュ削除 ＋ `navigator.serviceWorker` の全 registration の `unregister()` ＋ `sessionStorage` ガードフラグの設定 ＋ `location.reload()` が一度だけ実行される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（新規 `chunkLoadRecovery.test.ts`） | mock した `caches` / `navigator.serviceWorker` / `sessionStorage` / `location.reload` に対し、ChunkLoadError 判定が真のとき：caches 全削除・全 registration unregister・ガードフラグ set・reload が**各1回**呼ばれること。dev（`NODE_ENV !== "production"`）では何も実行しないこと | 回復ユーティリティ（例: `chunkLoadRecovery.ts`）を `ServiceWorkerRegister` と同様の本番ガードで実装し、純粋関数＋副作用を分離してテスト容易にする |
| Frontend Unit（同上） | ChunkLoadError **以外**のエラー（通常のネットワークエラー等）では回復を発火しないこと（誤発火防止） | 誤発火・リロードループのリスク低減を担保 |

**E2E判定:** No
**理由:** ブラウザ上で本物の ChunkLoadError（origin から削除された chunk の 404）を再現するのは高コストかつ flaky で、`caches`/`serviceWorker`/`reload` の副作用検証はブラウザ実機を必要としない（判断ツリー Q1=No）。mock したグローバルに対する unit で、判定ロジック・副作用呼び出し・本番ガード・誤発火防止をすべて網羅できる。design.md でも「回復ロジックの E2E は不要、unit で担保」と明記。

---

#### S-4: 回復リロードは1セッション1回に制限される
**Given:** 回復リロードを既に1回試行し `sessionStorage` ガードフラグが立っている端末
**When:**  リロード後に再び ChunkLoadError が発生する
**Then:**  再度の caches 削除・unregister・reload は行わない（無限ループしない）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`chunkLoadRecovery.test.ts`） | ガードフラグが既に set 済みの状態で回復関数を呼んでも、caches 削除・unregister・reload が**呼ばれない**こと | リロードループ防止の核。S-3 と同一ファイルで網羅 |

**E2E判定:** No
**理由:** ガードによる1回制限はピュアな状態分岐であり、`sessionStorage` mock で完全に検証できる（判断ツリー Q1=No）。ブラウザ実機での再現は reload を伴い flaky になるため不適。

---

### SW 契約シナリオ（キャッシュ戦略・pre-cache の単体検証）

これらはソース／ビルド生成物のインスペクションで担保する既存 unit テストの**更新**であり、旧挙動を誤ってアサートし続けないよう逆転が必須。

#### サマリ
| # | シナリオ | スコープ | 対象テスト | 旧→新 |
|---|---------|---------|-----------|-------|
| C-1 | document destination の戦略が NetworkFirst である | Frontend Unit | `sw.config.test.ts` S-8 guard | `StaleWhileRevalidate` → `NetworkFirst` |
| C-2 | `/stock-items` shell HTML が pre-cache に含まれない | Frontend Unit | `sw.precache.test.ts` | 「含む」→「含まない」 |
| C-3 | start_url の precache 必須を要求するドリフトガードを撤去/反転する | Frontend Unit | `sw.precache.test.ts` drift guard | 撤去または反転 |

#### C-1: document handler が NetworkFirst
**Given:** `frontend/src/sw.ts` のランタイムキャッシュ定義
**When:**  ソースを検査する
**Then:**  `request.destination === "document"` の matcher に対応する handler が `new NetworkFirst(...)`（`pantry-document-pages` cacheName 維持）である。`StaleWhileRevalidate` の import / 使用が document 経路から消えている

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit (`sw.config.test.ts`) | 既存「S-8 guard」ブロックの `new StaleWhileRevalidate` アサートを `new NetworkFirst` に**書き換える**。`request.destination === "document"` のアサートは維持 | NetworkOnly(API)/CacheFirst(static) の既存 guard（S-6/S-7）は変更不要 |

**E2E判定:** No — ソース検証で十分（DOM 不要、判断ツリー Q1=No）。実 SW 挙動の確認は S-1 でカバー。

#### C-2: `/stock-items` が pre-cache されない
**Given:** ビルド済 `public/sw.js` の pre-cache manifest と `next.config.ts` の `additionalPrecacheEntries`
**When:**  生成物／設定を検査する
**Then:**  `/stock-items` の HTML エントリが pre-cache manifest に**存在しない**。`/_next/static/chunks/*`・`/_next/static/media/*`・`/icon-192.png`・`/icon-512.png`・`/favicon.ico`・`/manifest.webmanifest` は引き続き存在する

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit (`sw.precache.test.ts`) | 既存 `it("contains /stock-items shell HTML entry")` を「`/stock-items` HTML エントリが**含まれない**」へ反転。静的アセット／アイコン／manifest の存在アサートは維持。`next.config.ts` の `additionalPrecacheEntries` から `{ url: "/stock-items", revision: null }` が消えていることも検証 | spec の MODIFIED「shell HTML は pre-cache されない」に対応 |

**E2E判定:** No — ビルド生成物のインスペクションで十分（ブラウザ不要）。

#### C-3: start_url precache 必須のドリフトガードを撤去/反転する
**Given:** `sw.precache.test.ts` のドリフトガード（manifest.ts の `start_url` が `next.config.ts` の `additionalPrecacheEntries` に**含まれることを要求**する）
**When:**  start_url は仕様上 `/stock-items` のまま維持される一方、本変更で `/stock-items` の precache エントリを撤去する
**Then:**  このガードは「start_url が precache に含まれる」を要求するため**そのままだと破綻する**。start_url を変更して回避するのではなく、**ガード自体を撤去または「start_url の HTML は precache されない」方向へ反転**する MUST

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit (`sw.precache.test.ts`) | 既存ドリフトガード（`it("manifest.ts start_url is listed in next.config.ts additionalPrecacheEntries")`）を削除、または「start_url の HTML は precache されない」アサートに反転する。**注意:** start_url は `/stock-items` のまま（manifest.ts は変更しない、S-11 で start_url 安定が要求される）ので、ガードを残したまま start_url を変えて回避してはならない | これが見落とされやすい gotcha。撤去しないと C-2 の変更で既存の合格テストが落ちる |

**E2E判定:** No — ソース／設定の整合性検証であり unit で完結。

---

### E2E判定サマリ

| シナリオ | E2E判定 | net-new E2E |
|---------|---------|-------------|
| S-1（document=NetworkFirst の実挙動） | Yes（既存 S-8 を**更新**） | 0 |
| S-2（オフラインフォールバック） | No（戦略選択 unit で代替） | 0 |
| S-3（ChunkLoadError 自己回復） | No（mock グローバルへの unit） | 0 |
| S-4（回復1回制限） | No（ガード分岐 unit） | 0 |
| C-1〜C-3（SW 契約） | No（ソース/生成物検証 unit） | 0 |

**サマリ:** E2E判定 **Yes は 1 件のみ**（S-1）で、それも既存 `service-worker.spec.ts` の S-8 を SWR→NetworkFirst 仕様へ書き換える**更新**であり、**net-new な E2E は 0 件**。残り全シナリオは unit（ソース検証／ビルド生成物検証／mock グローバルへの副作用検証）で担保し、テストピラミッド（unit 厚め・E2E 薄め）を維持する。

**E2E を増やさない根拠（判断ツリー適用）:**
- ChunkLoadError 自己回復（S-3/S-4）はブラウザ実機での本物の chunk 404 再現が高コスト・flaky で、副作用（caches 削除／unregister／reload）はすべて mock 可能なため Q1=No → unit。
- オフラインフォールバック（S-2）と戦略・pre-cache の契約（C-1〜C-3）はライブラリ保証の挙動またはソース/生成物の静的検証で代替でき、ブラウザ起動を要さない（Q1=No）。
- 唯一ブラウザ実 SW を要する「オンライン時にネットワーク HTML が勝つ」検証（S-1）は、新規追加ではなく既存 S-8 の更新として吸収する。

**テストファイル対応表:**
| テストファイル | 変更種別 | 内容 |
|--------------|---------|------|
| `frontend/src/sw.config.test.ts` | 更新 | S-8 guard を `StaleWhileRevalidate` → `NetworkFirst` に |
| `frontend/src/sw.precache.test.ts` | 更新 | `/stock-items` 含む→含まない、start_url ドリフトガード撤去/反転 |
| `frontend/src/chunkLoadRecovery.test.ts` | 新規 | ChunkLoadError 判定・副作用・1回ガード・本番ガード・誤発火防止 |
| `frontend/e2e/service-worker.spec.ts` | 更新 | S-8 を SWR→NetworkFirst 仕様へ書き換え（net-new なし） |
