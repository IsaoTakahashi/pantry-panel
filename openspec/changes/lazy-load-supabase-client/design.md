## Context

`frontend/src/lib/supabaseClient.ts`(現状):

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("Supabase env vars not set, realtime disabled");
    return null;
  }
  if (!_client) {
    _client = createClient(url, key);
  }
  return _client;
}
```

呼び出し元:
- `AuthContext.tsx`(ルートレイアウトの `AuthProvider` が全ページを包む): 静的 import。4箇所で呼ぶ — (1) 起動時 `getSession()` 取得の `useEffect`、(2) `onAuthStateChange` 購読の `useEffect`、(3) `signInWithGoogle`(async 関数)、(4) `signOut`(async 関数)
- `AuthGuard.tsx`: `authEnabled = getSupabaseClient() !== null` を**レンダー本体で同期的に**評価
- `useStockItemsRealtime.ts`(`/stock-items` でのみ使用): 購読 `useEffect` で1箇所

実測(2026-09-02、`next build --webpack`): `42-1c18ee16c6f310b4.js`(raw 175KB、`GoTrueClient` と `RealtimeClient` の両方を含む)が `/login` と `/stock-items` の**両方**の生成 HTML の `<script>` タグに含まれる。`AuthContext` が全ページ root で静的 import しているため、認証を使うだけの `/login` でも RealtimeClient を含む SDK 全体が同期的にロードされている。

SDK(`createClient()`)は認証とリアルタイムを1つの `SupabaseClient` インスタンスに統合しており、パッケージレベルで分離する手段は無い(`@supabase/supabase-js` の `createClient` が内部で両方を生成する)。そのため本変更は SDK 全体を非同期チャンクとして分離する方針を取り、認証とリアルタイムを機能単位で分けることはしない。

`#236`(Issue #236, PR #239)は `AuthContext` の `getSession()` 呼び出しをできるだけ早く発火させ、`/api/stock-items` の推測フェッチが `/api/groups/me` の確定を待たずに開始されるよう並行化した。本変更が `getSupabaseClient()` を非同期化すると、`getSession()` の呼び出しタイミングが SDK チャンクの読み込み完了まで遅延しうる。この遅延を最小化することが本変更の最重要な制約。

## Goals / Non-Goals

**Goals:**
- `@supabase/supabase-js`(175KB)を全ページ共有の同期バンドルから外し、非同期チャンクに分離する
- `#236` が実現した並行フェッチのタイミング(`accessToken` 判明が早い)を可能な限り維持する
- `AuthGuard` の `authEnabled` 判定を、SDK ロードに依存しない同期的な判定に置き換える

**Non-Goals:**
- 認証とリアルタイムを別パッケージ/別チャンクに分離すること(SDK の制約により不可能。Non-Goal として明示)
- `getSupabaseClient()` 以外の API 設計変更(呼び出し元のシグネチャ変更は最小限に留める)

## Decisions

### Decision 1: `supabaseClient.ts` 内部で `@supabase/supabase-js` を動的 import し、モジュール評価時に即座に発火してキャッシュする

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

function loadClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("Supabase env vars not set, realtime disabled");
    return Promise.resolve(null);
  }
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key),
  );
}

// モジュール評価時(＝最初にこのファイルが import された時点)に即座に発火する。
// 呼び出し元の実際の getSupabaseClient() 呼び出しタイミングを待たない。
const _clientPromise = loadClient();

export function getSupabaseClient(): Promise<SupabaseClient | null> {
  return _clientPromise;
}
```

**理由:** `AuthContext.tsx` は `supabaseClient.ts` を静的 import し続ける(SDK 本体ではなくこの薄いラッパーのみを静的 import する)。`supabaseClient.ts` 自体は軽量(SDK を動的 import するだけ)なので、`AuthContext.tsx` の同期バンドルには含まれない。一方で `supabaseClient.ts` のモジュール本体は `AuthContext.tsx` が import された時点で即座に評価されるため、動的 import はアプリ起動のごく初期に発火する。

**トレードオフ(検討・許容した点):** 静的 import と異なり、動的 import は「`supabaseClient.ts` のモジュール本体が実行されるタイミング」まで発火が遅れる。これは JS メインバンドルの取得・パースが完了してから発火するため、静的 import(HTML パース中にチャンク取得が始まる)より遅い。**初回訪問(cold)では実際に遅延が発生しうる。** ただし、`next.config.ts` の Service Worker 設定で `_next/static/chunks/*` は CacheFirst でプリキャッシュされるため、**2回目以降の訪問(warm)ではチャンク取得が CacheStorage ヒットになりほぼ無視できるコストになる**。`#236` が実測したのは warm シナリオ(storageState でセッション再現)であり、ユーザーの「毎回遅い」という当初の課題も warm な再訪問が主な対象。この非対称性(cold は悪化しうる、warm は改善する)を許容し、タスク5で warm シナリオでの回帰が無いことを実測で確認する。**もし回帰が確認されたら**、フォールバックとしてルートレイアウトで `ReactDOM.preinit(chunkUrl, { as: "script" })` 相当の先読みヒントを追加し、動的 import の発火をさらに早める(具体的なチャンク URL はビルド時に決まらないため、この場合は `next/dynamic` 経由のプリロードや `<link rel="modulepreload">` の手動注入を再検討する)

**代替案:** (a) `getSupabaseClient()` 自体を初回呼び出し時にのみ動的 import する(現状に近い): 呼び出し元(`AuthContext` の `useEffect`)が実行されるまで発火が遅れ、モジュール評価時発火よりさらに遅くなる。不採用。(b) 認証専用の軽量クライアント(REST 直叩き)を自作し `GoTrueClient` を分離: SDK 分の実装・保守コストが大きく、本 Issue のスコープを超える。将来的な検討事項として残す

### Decision 2: `AuthContext.tsx` の2つの `useEffect`(getSession・onAuthStateChange)を cancel ガード + 遅延クリーンアップで非同期化する

```ts
useEffect(() => {
  let cancelled = false;
  getSupabaseClient().then((client) => {
    if (cancelled) return;
    if (!client) {
      setLoading(false);
      return;
    }
    client.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      // 既存のロジック(setSession, loadGroups 呼び出し等)
    });
  });
  return () => {
    cancelled = true;
  };
}, [loadGroups]);
```

`onAuthStateChange` の購読 effect も同様のパターンだが、購読ハンドル(`subscription`)の生成が非同期の内側にあるため、クリーンアップ時に「まだ解決していなければ何もしない、解決済みなら unsubscribe する」形にする:

```ts
useEffect(() => {
  let cancelled = false;
  let sub: { unsubscribe: () => void } | undefined;
  getSupabaseClient().then((client) => {
    if (cancelled || !client) return;
    sub = client.auth.onAuthStateChange((_event, s) => {
      // 既存のロジック
    }).data.subscription;
  });
  return () => {
    cancelled = true;
    sub?.unsubscribe();
  };
}, [loadGroups]);
```

**理由:** React の StrictMode(このプロジェクトはデフォルト有効)は開発時に effect を意図的に2重実行する。ガード無しで非同期処理を effect 内に置くと、マウント→アンマウント→再マウントの間に最初の Promise が解決し、2つ目の `onAuthStateChange` ハンドラや `RealtimeClient` チャンネルが並行して残ってしまう(`#217` で修正した over-fetch storm ・重複購読と同じ性質のバグ)。`cancelled` フラグと、購読解除を確実に行うクリーンアップの両方が必要。

### Decision 3: `useStockItemsRealtime.ts` の購読 effect も同じパターンで非同期化する

Decision 2 と同型: `cancelled` フラグ + `channel` 変数をクロージャで保持し、クリーンアップで「解決済みなら `removeChannel`、未解決ならフラグのみ立てる」。

**理由:** Decision 2 と同じ(単一購読の invariant を壊さないため)。

### Decision 4: `AuthGuard.tsx` の `authEnabled` を環境変数の同期チェックに変更する

```tsx
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, group, speculativeGroupId, loading } = useAuth();
  const router = useRouter();
  const authEnabled = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  // 以下は変更なし
}
```

**理由:** `authEnabled` はレンダー本体で同期的に参照される(`if (!authEnabled) return <>{children}</>;`)ため、`getSupabaseClient()` が非同期化された後は呼べない。`NEXT_PUBLIC_*` 環境変数は Next.js のビルド時に静的な値として埋め込まれるため、この判定は実行時コストゼロの同期チェックになる。「Supabase が設定されているか」と「SDK チャンクのロードに成功したか」は本来別の関心事であり、分離することでむしろ意味が明確になる(SDK チャンクのロード失敗時のフォールバック挙動は本変更のスコープ外。現状も考慮されていない)。

**理由(render body で評価する点):** モジュールスコープの定数にすると、テストで `vi.stubEnv` を使って env を差し替えてもモジュールキャッシュ済みの値が変わらず、`vi.resetModules()` + 動的 `await import()` が全テストに必要になる。render body で毎回評価すればテストごとに `vi.stubEnv` するだけで済む。

## Risks / Trade-offs

- [Risk] (Decision 1 のトレードオフ節で詳述)cold 訪問時に `accessToken` 判明が静的 import 時より遅れる可能性がある → 当初計画(タスク7.2)では `#236` の実測ハーネスをこの PR の Vercel Preview URL に対して実行する予定だったが、Preview URL が Vercel Deployment Protection(SSO ウォール)で保護されており、ローカルセッションから `VERCEL_BYPASS_TOKEN`(CI 専用の GitHub Actions secret)の値を取得できずブロックされた。**ユーザーと協議の上、代替として Task 6 の mutation testing による検証(`AuthContext.tsx` の該当 effect を意図的に直列化し、`startupFetch.integration.test.tsx` の該当テストが red になることを実証した)を pre-merge の十分な保証として採用し、タスク7.2はスキップする**ことをルールとして決定した(2026-09-03)。Task 6 は jsdom 上での React effect ロジックレベルの検証であり実ブラウザのネットワーク/チャンク取得挙動までは検証していないという限界はあるが、post-merge の本番実測(タスク9.5、SSO 保護の無い本番 URL に対して実行可能)で実ブラウザでの並行フェッチ構造を最終確認する。有意な後退があれば post-merge で発覚し、フォールバック(`ReactDOM.preinit` 相当の先読み)を検討する
- [Note] `next build --webpack` の実測(2026-09-02、PR #244 マージ後)では `/login`/`/stock-items` 両方の `<script>` タグに `42-*.js`(175KB、`GoTrueClient`+`RealtimeClient` を含む)と `44530001-*.js`(63KB、`GoTrueClient` を含む)の**2つ**のチャンクが含まれていた。本変更の完了確認(タスク7)ではこの2チャンク両方の扱いを明示的に確認する(どちらも同期 `<script>` 参照から消えるべき。`44530001-*` が SDK 由来でなく無関係な偶然の文字列一致だった場合はその旨を記録する)
- [Risk] StrictMode の2重実行で非同期 effect が重複購読を生む可能性 → Decision 2/3 の cancel ガード + 遅延クリーンアップで対応。`testing.md` 2026-09-01 の基準どおり、2つの到着順序(resolve が先 / unmount が先)を両方テストする
- [Risk] `startupFetch.integration.test.tsx`(`#236` の並行化保証テスト)の `supabaseClient` モックを Promise 返却に変えるだけでは、非同期化後も実際に discriminator として機能しているか(直列実装に戻しても red になるか)が保証されない → タスクでモック変更後に意図的に直列実装へ戻して red になることを確認する手順を含める
- [Risk] `AuthGuard.test.tsx` の既存 `@/lib/supabaseClient` モックは `authEnabled` の実装変更後は無関係になる(dead mock) → `vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ...)` 等に置き換える
- [Trade-off] SDK を認証/リアルタイムに分離しない(Non-Goal)ため、`/login` のような認証のみ使うページでも RealtimeClient 込みの SDK 全体(175KB)を非同期ロードすることになる。分離の実装コストに見合わないと判断

## Migration Plan

- 通常の PR フロー(実装 → ローカル E2E → push → CI → archive → merge)。DB マイグレーションやフィーチャーフラグは不要
- ロールバック: 通常の revert で良い(状態を持つ変更ではない)

## Open Questions

(なし)
