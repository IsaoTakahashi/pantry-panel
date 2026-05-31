## Why

PWA を「ホームに追加」して再起動するたびに **600ms〜数秒の白画面**が出る。本番計測の結果、原因は Lambda コールドスタートではなく **Service Worker が無いため毎回フルのネットワーク取得が走る**ことが判明した（GitHub Issue #179 / #180 参照）。SW を導入して shell と静的アセットを pre-cache すれば、PWA 再起動は理論上 <100ms で skeleton が描画でき、オフラインや低速網でも体感が大きく改善する。

## What Changes

- `frontend/` に **Service Worker** を導入する（`@serwist/next` を利用、App Router 対応）
- 静的アセット（HTML shell, CSS, JS chunks, fonts, icons）を **install 時に pre-cache** する
- ランタイムキャッシュ戦略を設定する:
  - `/api/*` (Lambda API): **NetworkOnly**（古い在庫データを返さないため）
  - 静的アセット (`/_next/static/*`, `/icon-*.png`, `/favicon.ico`): **CacheFirst**
  - Supabase Realtime (WebSocket): SW のスコープ外（fetch ではないため自動的に対象外）
- SW の **install → wait → activate** ライフサイクルに従い、新バージョン配信時は `skipWaiting()` で即時更新する
- 開発時 (`npm run dev`) は SW を無効化する
- 既存 E2E (`mock` / `preview`) で SW 起因の干渉が無いか確認する
- **BREAKING** はなし。既存の PWA インストールはそのまま維持される

## Capabilities

### New Capabilities
- なし（既存の `frontend-pwa` を拡張する）

### Modified Capabilities
- `frontend-pwa`: PWA は Service Worker を登録し、shell と静的アセットを pre-cache する要件を追加する

## Impact

- **追加ファイル**: SW ソース (`frontend/src/sw.ts` or `frontend/app/sw.ts`)、registration コンポーネント
- **設定変更**: `next.config.ts` に `withSerwist` ラッパーを追加。`package.json` に `@serwist/next` 依存を追加
- **公開アセット**: `/sw.js` が新規に配信される（現在は 404）
- **既存 E2E**: SW がブラウザに残ることで stale なテスト結果を返す可能性 → Playwright の `serviceWorkers: "block"` 設定 or テスト前後の SW unregister を検討
- **デプロイ後の挙動**:
  - 既存 PWA インストールは保持される（再追加不要）
  - デプロイ直後の 1 回目の起動は今と同等の速度（SW 取得 + pre-cache 実行）
  - 2 回目以降の起動から効果発現

## ユーザーシナリオとテスト設計

本変更は Service Worker をフロントエンドに導入する変更で、API 契約変更は含まれない。

- **フロントエンドシナリオ**: SW 登録・pre-cache・ランタイムキャッシュ戦略・ライフサイクル・既存 PWA の維持・既存 E2E への影響について 13 件設計する
- **バックエンドシナリオ**: なし（Lambda API のハンドラ・スキーマは変更しない。SW 側で `/api/*` を NetworkOnly に振り分けるだけで、Backend からは通常の REST 呼び出しとして観測される）

### フロントエンドシナリオ

#### サマリ

| # | シナリオ | 環境 | スコープ | 主に対応する Requirement |
|---|---------|------|---------|------------------------|
| S-1 | 本番ビルドで `/sw.js` が配信される | Mock | E2E | Req1: SW 登録 / Scenario「本番で /sw.js が配信される」 |
| S-2 | 本番ビルドでブラウザが SW を登録しスコープが `/` になる | Mock | E2E | Req1 / Scenario「本番でブラウザが SW を登録する」 |
| S-3 | 開発モードでは `/sw.js` が返らない | - | Frontend Unit (config 検査) | Req1 / Scenario「開発モードでは /sw.js を返さない」 |
| S-4 | pre-cache manifest に shell / 静的アセット / アイコンが含まれる | - | Frontend Unit (build 出力検査) | Req2 / Scenario「pre-cache 対象に shell HTML と静的アセットが含まれる」 |
| S-5 | install 後に CacheStorage が pre-cache 対象で満たされる | Mock | E2E | Req2 / Scenario「install 後にキャッシュへ書き込まれる」 |
| S-6 | `/api/*` レスポンスはキャッシュされない（NetworkOnly） | Mock | E2E | Req3 / Scenario「API レスポンスはキャッシュされない」 |
| S-7 | 静的アセットはキャッシュから即返る（CacheFirst） | Mock | E2E | Req3 / Scenario「静的アセットはキャッシュ優先で返る」 |
| S-8 | shell HTML はキャッシュ即返 + 裏で更新される（SWR） | Mock | E2E | Req3 / Scenario「shell HTML はキャッシュを即返しつつ裏で更新する」 |
| S-9 | 新 SW が install 直後に skipWaiting し activate に進む | - | Frontend Unit (SW ソース検査) | Req4 / Scenario「新 SW が install されたら待機せず activate する」 |
| S-10 | 新 SW が activate 後に clients.claim する | - | Frontend Unit (SW ソース検査) | Req4 / Scenario「activate 後に既存タブをクレームする」 |
| S-11 | 既存 PWA の `start_url` / `name` / アイコンが変更されていない | - | Frontend Unit (manifest 検査) | Req5 / Scenario「既存ホーム画面ショートカットは引き続き起動する」 |
| S-12 | Playwright の `mock` / `preview` project で `serviceWorkers: "block"` が設定されている | - | Frontend Unit (config 検査) | Req6 / Scenario「mock project は SW を block する」「preview project は SW を block する」 |
| S-13 | SW 専用 E2E が独立 spec ファイルとして存在する | - | Frontend Unit (ファイル存在) + tasks.md 検証 | Req6 / Scenario「SW 専用 E2E が独立ファイルで存在する」 |

> 備考: Playwright の既存 `mock` project は `webServer: npm run dev` 起動 + `serviceWorkers: "block"` 前提。SW を有効にしたテスト (S-1, S-2, S-5〜S-8) は **本番ビルド (`npm run build && npm run start`) を別 port で起動し `serviceWorkers: "allow"` で接続する独立 spec ファイル**（例: `e2e/service-worker.spec.ts`、専用 Playwright project または `test.use({ serviceWorkers: "allow" })` で隔離）に集約する。既存 `mock` project と棲み分けることで、既存 E2E への影響をゼロに保つ。

---

#### S-1: 本番ビルドで /sw.js が配信される

**Given:** 本番モードでビルド済の Next.js サーバ（`npm run build && npm run start`）が起動している
**When:** ブラウザから `/sw.js` を `fetch` する
**Then:** HTTP 200 と JavaScript MIME の SW スクリプトが返る

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | `request.get('/sw.js')` が 200 を返し body が空でないこと | SW 専用 spec 内で本番ビルドサーバに対して実行 |
| Frontend Unit | — | E2E で十分（ビルド出力の中身検査は S-4 で別途実施） |

**E2E判定:** Yes
**理由:** Next.js の本番ビルド出力（`@serwist/next` が生成）を実サーバ経由で検証する必要があり、ビルド + サーバ起動 + HTTP の一連を見ないと Vercel デプロイ時の挙動を保証できない。

---

#### S-2: 本番ビルドでブラウザが SW を登録しスコープが / になる

**Given:** 本番ビルド済サーバが起動し、Playwright は `serviceWorkers: "allow"` で接続している
**When:** `/stock-items` を開き、`navigator.serviceWorker.ready` を待つ
**Then:** 解決された ServiceWorkerRegistration の `scope` が `<origin>/` で終わる

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | `page.evaluate(() => navigator.serviceWorker.ready.then(r => r.scope))` の結果が `/` で終わる | iOS Safari の挙動はローカルでは検証不可。手動確認で補う |
| Frontend Unit | — | ブラウザの SW API が必要 |

**E2E判定:** Yes
**理由:** `navigator.serviceWorker` は実ブラウザでしか動かず、登録 helper のスコープ設定が正しく効いているかは E2E 必須。

---

#### S-3: 開発モードでは /sw.js を返さない

**Given:** `npm run dev` で起動した Next.js dev サーバが立っている
**When:** `GET http://localhost:3000/sw.js` を発行する
**Then:** HTTP 404 または 200 で空ファイル（少なくとも実 SW スクリプトではない）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | `next.config.ts` の `withSerwist` 呼び出しに `disable: process.env.NODE_ENV === "development"` 相当が設定されていることを Vitest で読み取る | 設定検査で十分 |
| E2E Mock | (任意 sanity) 既存 `mock` project の前処理で `request.get('/sw.js')` が SW スクリプトを返さないことを確認 | 既存 dev サーバを使う既存 mock project と整合性を取る目的の補助チェック |

**E2E判定:** No
**理由:** 設定値の存在検査で再現可能。HMR と SW のキャッシュ競合の根本原因（disable フラグ）が設定ファイルで断定できるため、ブラウザ起動は不要。

---

#### S-4: pre-cache manifest に shell / 静的アセット / アイコンが含まれる

**Given:** `npm run build` を実行した直後（`.next/` と SW の生成成果物が出ている状態）
**When:** 生成された SW ファイル（`public/sw.js` または `.next/...`）または `@serwist/next` の build manifest を読む
**Then:** 以下のエントリが含まれている
- `/stock-items`（または対応する shell HTML エントリ）
- `/_next/static/chunks/*` の少なくとも 1 つ
- `/_next/static/media/*`（フォント等。プロジェクトに該当アセットが存在する場合）
- `/icon-192.png`, `/icon-512.png`, `/favicon.ico`, `/manifest.webmanifest`

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | Vitest で生成済 `sw.js`（テキスト）を読み、上記 URL パターン（正規表現マッチ）が含まれていることを assert | 事前に `npm run build` を済ませる必要があるため CI ジョブの順序に注意（vitest 前に build を 1 回走らせる、または専用ジョブで実施） |
| E2E Mock | — | manifest 内容そのものは静的に検証できるので E2E 不要 |

**E2E判定:** No
**理由:** ビルド成果物の中身検査は実ブラウザを要しない。CI は build → vitest の順で構成すれば再利用可能。

---

#### S-5: install 後に CacheStorage が pre-cache 対象で満たされる

**Given:** 本番ビルド済サーバが起動、Playwright は `serviceWorkers: "allow"`、初回アクセスで SW が install される
**When:** `/stock-items` を開き、`navigator.serviceWorker.ready` 後に `caches.keys()` と各 cache の `.keys()` を `page.evaluate` で取得する
**Then:** Serwist が使う precache cache（例: `serwist-precache-*` 等）が存在し、S-4 の代表 URL（少なくとも `/icon-192.png`, `/manifest.webmanifest`, `/_next/static/chunks/*` の代表 1 件）がキャッシュにヒットする

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | `page.evaluate` 経由で `caches.keys()` → 各 cache の `.keys()` を取り、期待 URL が含まれることを assert | install 完了待ちは `navigator.serviceWorker.ready` と `controllerchange` の組合せ |
| Frontend Unit | — | CacheStorage は実ブラウザにしか存在しない |

**E2E判定:** Yes
**理由:** CacheStorage はブラウザ API。install 後の実キャッシュ反映は SW 実行サイクルが回らないと再現できない。

---

#### S-6: /api/* レスポンスはキャッシュされない（NetworkOnly）

**Given:** SW が active な状態で `/stock-items` を開いている
**When:** ページ操作で `/api/stock-items` が fetch され、レスポンスが返った後に `caches.match('/api/stock-items')` を `page.evaluate` で呼ぶ
**Then:** どの cache にも一致しない（`undefined` が返る）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | API レスポンスを `page.route` でモックし、レスポンス受領後に `caches.match(...)` が `undefined` であることを確認 | SW 専用 spec で実施 |
| Frontend Unit | (補助) SW ソース内で API パスのルーティングが NetworkOnly handler に紐づくことを正規表現で確認 | 単体テストで二重ガード |

**E2E判定:** Yes
**理由:** 「キャッシュされないこと」の保証はランタイム挙動。SW ソース検査だけでは設定ミスや route 優先順位の問題を見落とす可能性があり、実 fetch + caches API 確認が必須。

---

#### S-7: 静的アセットはキャッシュから即返る（CacheFirst）

**Given:** SW install 完了済 + 一度 `/_next/static/chunks/*` の代表アセットをロード済
**When:** 同 URL を 2 回目以降にリクエストする
**Then:** ネットワークに到達せずキャッシュからレスポンスが返る（`page.route` で 503 を返す handler を後付けしても 200 が返る = ネットワークに到達していない）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | 該当 URL に `page.route` で 503 を返す handler を後付けし、それでも 200 が返ることを確認 | ハッシュ付きファイル名なので URL は build 後に確定。代表 1 件をテスト内で動的に取得 |
| Frontend Unit | (補助) SW ソース内で `_next/static/*` パターンが CacheFirst handler に紐づくことを正規表現で確認 | — |

**E2E判定:** Yes
**理由:** Cache 戦略の発火確認はブラウザ + SW + CacheStorage の協調が必須。

---

#### S-8: shell HTML はキャッシュ即返 + 裏で更新される（SWR）

**Given:** `/stock-items` を 1 回開き、その HTML が SW キャッシュに保存済
**When:** 再度 `/stock-items` をリロードする
**Then:** (a) 即座にキャッシュ済 HTML がレンダリングされる、かつ (b) 一定時間後に `caches.match('/stock-items')` の body がネットワーク側の新内容で更新されている

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | (a) `page.route('/stock-items', delay + body "new")` を仕掛けて、ナビゲーション完了時点では古い body、数秒後の `caches.match` で新 body が取得できることを確認 | SWR の「裏で更新」を deterministic に観測するため、レスポンス内容を意図的に差分化する |
| Frontend Unit | (補助) SW ソース内で `document` destination が StaleWhileRevalidate handler に紐づくことを確認 | — |

**E2E判定:** Yes
**理由:** SWR の「即返 + 裏更新」は実ランタイムでしか観測できない。

---

#### S-9: 新 SW が install 直後に skipWaiting し activate に進む

**Given:** SW ソース (`frontend/src/sw.ts` 等) または `withSerwist` の設定が存在する
**When:** ソース・設定を静的に検査する（Vitest）
**Then:** install ハンドラ内または top-level で `self.skipWaiting()` が呼ばれている、もしくは `@serwist/next` の `skipWaiting: true` 相当のオプションが設定されている

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | SW ソース/設定ファイルを文字列で読み `skipWaiting` の呼び出し or 設定オプションを assert | ソース検査で十分 |
| E2E Mock | — | 旧 SW → 新 SW の世代切替を E2E で観測するのは工数が高い。本番デプロイのカナリアで観測する方が現実的 |

**E2E判定:** No
**理由:** 「設定として skipWaiting が有効になっていること」がプロジェクト要件。実切替の E2E はコスト対効果が悪く、Unit ガード + 本番手動確認で十分。

---

#### S-10: 新 SW が activate 後に clients.claim する

**Given:** SW ソースまたは `withSerwist` の設定が存在する
**When:** ソース・設定を静的に検査する
**Then:** activate ハンドラ内または top-level で `self.clients.claim()` が呼ばれている、もしくは `@serwist/next` の `clientsClaim: true` 相当のオプションが設定されている

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | `clients.claim` 呼び出し or `clientsClaim` オプションが SW ソース/設定に含まれることを assert | — |
| E2E Mock | — | 実観測は本番カナリアに委ねる |

**E2E判定:** No
**理由:** S-9 と同様、設定有無の保証が要件。実切替 E2E はコスト対効果に見合わない。

---

#### S-11: 既存 PWA の start_url / name / アイコンが変更されていない

**Given:** 本変更前後の `public/manifest.webmanifest`（または `app/manifest.ts`）の内容
**When:** Vitest で manifest をパースし、特定キーを参照する
**Then:** `start_url === "/stock-items"`、`name`、`short_name`、`icons` の URL 配列が変更前と同一

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | manifest を読み、既存 spec の `frontend-pwa` で定義された値と一致することを assert | 既存 `frontend-pwa` の manifest テストに項目追加、または同等の検証を新規追加 |
| E2E Mock | — | 静的ファイル比較で十分 |

**E2E判定:** No
**理由:** ファイル内容の不変性は静的検査で確実に検出できる。

---

#### S-12: Playwright の mock / preview project で serviceWorkers: "block" が設定されている

**Given:** `frontend/playwright.config.ts` がリポジトリにある
**When:** Vitest（または同等の Node スクリプト）で config を import し、`projects[].use.serviceWorkers` を確認する
**Then:** `mock` / `preview` の双方で `"block"` が設定されている（SW 専用 spec を含む別 project は `"allow"`）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | `playwright.config.ts` を import して各 project の `use.serviceWorkers` を assert | tasks.md でも config 変更を明示的に項目化する |
| E2E Mock | — | config inspection のみで十分 |

**E2E判定:** No
**理由:** 設定値の存在検査。ブラウザ起動不要。

---

#### S-13: SW 専用 E2E が独立 spec ファイルとして存在する

**Given:** 本変更で SW 専用 E2E を追加する想定
**When:** `frontend/e2e/` 配下のファイル一覧を確認する
**Then:** `service-worker.spec.ts`（または同等の名称）が存在し、S-1, S-2, S-5, S-6, S-7, S-8 を内包している

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | Vitest で `fs.existsSync('e2e/service-worker.spec.ts')` を assert（簡易） | tasks.md のチェックリストでも明示 |
| tasks.md 検証 | tasks.md に「SW 専用 spec ファイルを作成する」「専用 project または `test.use({ serviceWorkers: "allow" })` で隔離する」のタスクを含める | 設計成果物 |

**E2E判定:** No
**理由:** ファイル存在 + 設定の問題でブラウザ実行は不要。

---

### スコープ別検証観点（マトリクス）

| 検証観点 | Frontend Unit | E2E (SW 専用 spec) | 備考 |
|---------|--------------|--------------------|------|
| /sw.js が本番で配信される | — | S-1 | 本番ビルドサーバ起動が前提 |
| SW 登録スコープが `/` | — | S-2 | `navigator.serviceWorker.ready` を `page.evaluate` |
| dev モードで SW 無効 | S-3 (config 検査) | (任意 sanity) | `disable` フラグの存在検査 |
| pre-cache manifest 内容 | S-4 (build 後の sw.js を読み URL パターン assert) | — | CI で build → vitest の順序が必要 |
| CacheStorage 反映 | — | S-5 | `caches.keys()` + `.keys()` 実観測 |
| API NetworkOnly | (補助) S-6 ソース検査 | S-6 | route handler 優先順 mis-config を検出 |
| 静的 CacheFirst | (補助) S-7 ソース検査 | S-7 | `page.route` で「ネットワーク到達なし」を保証 |
| shell SWR | (補助) S-8 ソース検査 | S-8 | 即返 + 裏更新の 2 段 assert |
| skipWaiting | S-9 (SW ソース/設定検査) | — | 実切替は本番カナリアで観測 |
| clients.claim | S-10 (SW ソース/設定検査) | — | 同上 |
| manifest 不変性 | S-11 | — | start_url / name / icons の固定 |
| Playwright SW block | S-12 | — | mock/preview project 両方 |
| SW 専用 spec の存在 | S-13 | — | tasks.md でも担保 |

### バックエンドシナリオ

#### サマリ

| # | シナリオ | スコープ |
|---|---------|---------|
| — | なし | — |

本変更は Lambda API のハンドラ・スキーマを一切変更しない。`/api/*` は SW で NetworkOnly に振り分けるが、Backend からは従来通りの REST 呼び出しとして観測される。よって新規の Backend Unit / Integration テストは追加しない。

> Note: 「SW が `/api/*` をキャッシュせず素通しする」性質は Frontend 側のシナリオ S-6 で検証する（バックエンドの責務ではない）。
