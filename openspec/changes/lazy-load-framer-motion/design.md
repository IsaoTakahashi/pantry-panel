## Context

`/stock-items` は `next build --webpack` の実測(2026-09-02)で `58-99765ec70131c04c.js`(raw 146KB、framer-motion エンジン本体: `motion`/`AnimatePresence`/`useDragControls`/`layout`/`popLayout` を含む)を読み込むが、`/login` など他ページの生成 HTML にはこのチャンクへの `<script>` 参照が無い。つまり framer-motion エンジンは Next.js の共有バンドルではなく `/stock-items` ルート固有のチャンクとして分離済みだが、`/stock-items` 自体の初回表示では同期的にロードされている。

原因は依存チェーン: `StockItemsClient.tsx`(トップレベルで `motion`/`AnimatePresence` を直接使用)と、`StockItemsClient.tsx` → `ConfirmDialog`(**静的 import**、他4モーダルと違い `dynamic()` 化されていない) → `BaseModal.tsx`(`motion`/`AnimatePresence`/`useDragControls` を使用)。

`package.json` は `"motion": "^13.0.0"` を宣言しているが、コードは全箇所 `from "framer-motion"` で import しており、実際に解決されるのは `node_modules/framer-motion`(v12.43.0、`motion` パッケージの transitive dependency)。`LazyMotion`/`m`/`domMax`/`domAnimation` は全てこのバージョンからエクスポートされていることを確認済み。

`BaseModal.tsx` はモバイルレイアウトで `drag`/`dragControls`/`dragConstraints`/`dragElastic` を使用し、`StockItemsClient.tsx` は `motion.div layout` + `AnimatePresence mode="popLayout"` を使用する。両方とも framer-motion の feature bundle 分類では `domAnimation`(基本アニメーション + exit)では不足しており `domMax`(+ drag + layout)が必要。

## Goals / Non-Goals

**Goals:**
- `/stock-items` の初回表示で同期的にパースされる framer-motion エンジンのウェイトを、非同期チャンクに分離する
- `ConfirmDialog` を他4モーダルと同じ `dynamic({ssr:false})` パターンに揃える
- アニメーションの見た目・挙動(scrim フェード、ダイアログのスケール/スライド、ドラッグでのスワイプダウン閉じる、リストの `popLayout` 差し替えアニメ)は変更しない

**Non-Goals:**
- Supabase Realtime の遅延ロード(Issue #238 のもう一方の follow-up。別 PR で対応する。本設計では触れない)
- `framer-motion` → `motion` パッケージへの import 元の切り替え(`package.json` の実体は既に `motion` v13 だが、import 元を揃える作業は本変更のスコープ外。挙動に影響しないため別途)
- 新規アニメーションの追加・アニメーション速度やイージングの変更

## Decisions

### Decision 1: `motion.*` → `m.*` + `LazyMotion` (features を非同期 import) を `MotionProvider` に集約する

`BaseModal.tsx` と `StockItemsClient.tsx` の `motion.div` を `m.div` に置き換える。`AnimatePresence` はそのまま(`m` component と組み合わせて使える。feature bundle の対象外で軽量)。

`domMax` を非同期ロードするための小ファイルを新設する:

```ts
// frontend/src/lib/framerMotionFeatures.ts
import { domMax } from "framer-motion";
export default domMax;
```

既存の `MotionProvider.tsx`(ルートレイアウトで全ページを包む)に `LazyMotion` を追加する:

```tsx
const loadFeatures = () =>
  import("@/lib/framerMotionFeatures").then((mod) => mod.default);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
```

**理由:** `MotionProvider` は既に「framer-motion 関連のルートラッパー」という役割を持つコンポーネントであり、`layout.tsx` 側の変更なしに一箇所へ集約できる。`strict` を付けることで、今後誰かが `m` の代わりに `motion` を使ってしまう regression をビルド時ではなく実行時エラーで即座に検出できる(このコンポーネントは全ページの root で使われるため、`m` を使う全箇所が対象になる)。

**代替案:** (a) `features` に `domMax` を直接渡す(同期): エンジン自体は依然同期バンドルに含まれてしまい、目的を達成しない。(b) `layout.tsx` に直接 `LazyMotion` を書く: `MotionProvider` という既存の抽象を無視することになり一貫性が下がる。(c) `domAnimation` のみロードし drag/layout は都度追加ロード: `BaseModal`(drag)と `StockItemsClient`(popLayout)の両方が常時使われるため、追加ロードのタイミング制御が複雑になるだけで実利がない。

### Decision 2: `ConfirmDialog` を `dynamic({ssr:false})` に変更する

`StockItemsClient.tsx` の `import ConfirmDialog from "@/components/ConfirmDialog";` を、他4モーダルと同じ形式に変更する:

```tsx
const ConfirmDialog = dynamic(() => import("@/components/ConfirmDialog"), {
  ssr: false,
});
```

**理由:** 既存の4モーダルと不整合だった唯一の静的 import。Decision 1 で `m`/`LazyMotion` 化しても `ConfirmDialog`(→`BaseModal`)自体のコンポーネントコードは `StockItemsClient.tsx` のチャンクに同期的に含まれ続けるため、Next.js のルートレベルコード分割と framer-motion レベルのコード分割は独立して両方効かせる。

**代替案:** そのままにする: 一貫性が崩れたまま残り、`StockItemsClient.tsx` 自体のチャンクサイズも不要に大きいまま。

## Risks / Trade-offs

- [Risk] `LazyMotion strict` は `m` 以外の `motion.*` がツリー内にあると実行時エラーを投げる → 対象箇所は `BaseModal.tsx` / `StockItemsClient.tsx` の2ファイルのみ(grep 済み)。`MotionProvider.test.tsx` は現在 `motion` を import してテスト用の子要素を描画しているため、`m` に書き換える必要がある(tasks.md に明記)
- [Risk] `features` が非同期ロードのため、`m` コンポーネントは features 解決前は無アニメーションで描画される(exit アニメも含む)。ユニットテスト(`BaseModal.test.tsx`, `ConfirmDialog.test.tsx`)がアニメーション完了を前提にした同期アサートをしている場合、タイミング起因で不安定になりうる → 実行して確認し、必要なら `waitFor`/`act` を追加する(tasks.md に確認タスクを追加)
- [Risk] E2E(`testing.md` 2026-06-18 の記載どおり `not.toBeAttached()` 待機が exit animation 完了待ちとして load-bearing)は、features 未解決時に exit アニメが即座に完了する可能性があり、むしろ flaky が減る方向のはずだが未検証 → ローカル `npx playwright test` で既存の modal/filter 系テストが引き続き pass することを確認する(既存ルールどおり必須)
- [Trade-off] `strict` を付けない選択肢もあったが、regression 検出のメリットがコスト(テスト1ファイルの書き換え)を上回ると判断した
- [Risk] `LazyMotion` を `MotionProvider`(root layout、全ページ共通)に置くため、webpack が非同期 features チャンクを「全ページから到達可能」と判断してビルド時に共有グラフへ hoist し、結果として `/login` 等 framer-motion を使わないページの読み込みにも影響が漏れる可能性がある → tasks.md 5.1 で `/login` の生成 HTML を実測確認する。もし漏れていたら、`LazyMotion` を root から `/stock-items` のページ/レイアウトコンポーネントの直下(`StockItemsClient.tsx` をラップする形)に移し、`MotionConfig` のみ root に残すフォールバックを取る

## Migration Plan

- 通常の PR フロー(実装 → ローカル E2E → push → CI → archive → merge)。DB マイグレーションやフィーチャーフラグは不要
- ロールバック: 通常の revert で良い(状態を持つ変更ではない)

## Open Questions

(なし)
