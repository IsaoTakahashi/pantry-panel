## Context

`/stock-items` ページは `<Suspense fallback={<StockItemsSkeleton/>}>` で `StockItemsClient`（および `dynamic()` で分割された各モーダル / framer-motion）を遅延読み込みする。これらは `_next/static/chunks/*.js` として別チャンクに分割される。

現状の Service Worker（`frontend/src/sw.ts`, `frontend/next.config.ts`、Serwist 製）には次の staleness 構造がある:

1. `additionalPrecacheEntries` で `/stock-items` の shell HTML を `revision: null` で pre-cache → SW 更新時も内容で更新されず、**最初の訪問時点の chunk ハッシュを参照する HTML が永続化**する
2. document destination のランタイム戦略が **StaleWhileRevalidate** → まず古い HTML を返す
3. `_next/static/*` は **CacheFirst**

新しい Vercel デプロイ後、origin から古い chunk が削除される。古い shell HTML が参照する `chunk-<oldhash>.js` は 404 → 遅延 import が reject → Suspense が解決できず ChunkLoadError でスケルトンのまま停止する。モバイルは SW/キャッシュが長期間生存しハードリロードもしないため顕在化しやすい（プライベートタブ=SW 非登録では再現しない、で root cause を確認済み）。

## Goals / Non-Goals

**Goals:**
- デプロイをまたいでも、オンラインのユーザーが常に有効な chunk ハッシュを参照する HTML を取得できるようにする（再発防止）
- すでに壊れた状態で固まっている既存端末を、次回アクセスで自己回復させる
- 既存の PWA インストール（`start_url`, アイコン, manifest）は維持する

**Non-Goals:**
- オフライン完全動作の強化（むしろ「初回オンライン取得前のオフライン即時表示」は捨てる）
- API キャッシュ戦略（NetworkOnly のまま）や静的アセット戦略（CacheFirst のまま）の変更
- バックエンド・認証・Supabase 周りの変更（root cause ではない）

## Decisions

### 決定1: document destination を NetworkFirst にする（A）
**理由**: オンライン時に常に最新 HTML を取得すれば、そこに埋め込まれた chunk ハッシュは必ず origin に存在する有効なものになる。これが staleness の根本対処。ネットワーク失敗時のみキャッシュへフォールバックするため、オフライン耐性は最低限維持される（初回オンライン取得後）。
**代替案**: StaleWhileRevalidate のまま `/stock-items` precache だけ外す → SWR は依然「1回ぶんの stale」を返すため、デプロイ直後の初回ナビゲーションで古い HTML→404 が起きうる。根本対処にならないため不採用。

### 決定2: `/stock-items` の `revision: null` pre-cache を撤去する（A）
**理由**: `revision: null` の HTML pre-cache が「永続的に古い chunk を指す HTML」の発生源。これを除去する。`_next/static` チャンク（`__SW_MANIFEST` 由来、revision 付き）と icons/manifest/favicon の pre-cache は維持する。
**代替案**: `/stock-items` に正しい revision を付与 → @serwist/next の HTML pre-cache に安定した revision を与えるのは難しく、NetworkFirst 化で目的を達成できるため不要。

### 決定3: ChunkLoadError 自己回復を追加する（B）
**理由**: 決定1・2 はデプロイ後の新規アクセスを救うが、**既に壊れた SW を保持して固まっている端末**は、その壊れた SW がまた古い HTML を返す可能性がある。クライアント側で chunk 取得失敗を検知し、`caches` 全削除＋SW 登録解除＋一度きりリロードで強制回復させる。
**実装方針**:
- `window` の `error` / `unhandledrejection` を購読し、ChunkLoadError（`error.name === "ChunkLoadError"` もしくはメッセージに `Loading chunk` / `dynamically imported module` を含む）を判定
- 検知時: `sessionStorage` のガードフラグを確認 → 未試行なら `caches.keys()` 全削除 + `navigator.serviceWorker` の全 registration を `unregister()` + フラグを立てて `location.reload()`
- 既に試行済みなら何もしない（無限ループ防止）
- `ServiceWorkerRegister` と同様の本番ガード（dev では作動させない）を踏襲し、独立ユーティリティ + レイアウトでマウントする小コンポーネントとして実装

### 決定4: TDD で sw.config / precache テストを更新し、回復ロジックの unit テストを追加する
- `sw.config.test.ts`: document handler が NetworkFirst であることを検証するよう更新
- `sw.precache.test.ts`: `/stock-items` が pre-cache に含まれないことを検証するよう更新
- 新規: ChunkLoadError 回復ユーティリティの unit テスト（ガードによる1回制限、caches 削除 / unregister / reload 呼び出し）

## Risks / Trade-offs

- **[オフライン初回表示の劣化]** → NetworkFirst は初回オンライン取得が済むまでオフラインで shell を出せない。Pantry Panel はオンライン前提の在庫管理 UI であり許容範囲。Non-Goal として明記。
- **[回復ロジックの誤発火 / リロードループ]** → `sessionStorage` フラグで1回に制限。ChunkLoadError の判定を限定し、通常のネットワークエラーで発火しないようにする。
- **[キャッシュ全削除の副作用]** → 回復時に `caches` を全削除するが、静的アセットは再取得可能であり実害は小さい。SW unregister 後 reload で最新 SW が再登録される。
- **[E2E flakiness]** → 既存 E2E は SW を `block` 設定済み。回復ロジックの E2E は不要、unit で担保する。

## Migration Plan

1. feature ブランチで sw.ts / next.config.ts / 回復ユーティリティを変更、テストを更新・追加
2. PR の CI（Vitest / Biome / tsc）で緑を確認、ローカル E2E（UI 変更を含むため）で pass 確認
3. main マージ → Vercel 自動デプロイ
4. デプロイ後: 既存の壊れた端末は次回アクセス時、新 SW の即時有効化（`skipWaiting`/`clientsClaim`）＋（必要なら）ChunkLoadError 回復で復旧する
5. ロールバック: 変更は SW 戦略の局所修正のため、問題時は revert で旧挙動に戻せる（ただし旧挙動が本バグの原因である点に留意）

## Open Questions

- ChunkLoadError 回復は専用コンポーネントとして `layout.tsx` にマウントするか、既存 `ServiceWorkerRegister` に統合するか（実装時に sub-agent が判断、テスト容易性を優先）
