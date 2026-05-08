## Context

Phase 2.5b で Backend が本番稼働した。次は Phase 2.5c で Frontend を Vercel にデプロイする予定だが、その前に Create Next App 由来のボイラープレート（`/` のサンプル画面、ページタイトル "Create Next App"）が残っており本番公開には不適切。加えて、`CreateItemModal` の Tailwind v4 非対応構文に起因する UI バグ、モーダル UX の改善、PWA 対応の不在など、まとめて修正したい項目が複数蓄積している。

## Goals / Non-Goals

**Goals:**
- 本番公開して恥ずかしくない最低限の Frontend ポリッシュ
- PWA としてインストール可能（"ホーム画面に追加" UI が出る状態）
- モーダルが期待通りに動作する（背景がきちんと隠す、操作不能になる）
- カテゴリ選択の手間削減（フィルタの値をデフォルト化）

**Non-Goals:**
- Service Worker / オフライン対応 — 別 change で扱う
- ダークモード対応 — 別 change で扱う
- アクセシビリティ全面監査 — 必要箇所のみ部分修正
- 国際化（i18n）— 旧仕様も日本語のみ

## Decisions

### PWA: 必要最低限のみ（manifest + icons）

Service Worker（オフライン / プッシュ通知 / バックグラウンド sync）は **対象外**。理由:
- 開発・運用コストの割に、家族用 PWA としての必要性が低い
- Vercel の Edge Network で十分高速
- 後で追加可能（増分対応）

manifest と icon の最小セットだけ用意して、ブラウザに「インストール可能な Web アプリ」として認識させる。

### アイコン: ユーザー提供の単一画像から派生

ユーザーは `frontend/public/icon.png` (512×512 PNG) を配置する。Manifest はこの 1 ファイルを 192 / 512 両サイズで参照（ブラウザがダウンスケール）。本格運用で気になるなら後で別サイズを追加。

- **採用理由**: ユーザー側の準備工数が最小、ブラウザのダウンスケール品質は十分
- **代替案**: 192 / 512 を別ファイルで用意 → 工数増、後でも追加可能

### Root redirect: `redirect()` 関数で server-side redirect

Next.js App Router の `redirect()` を使う。ステータスコードは Next.js デフォルト（307 Temporary Redirect）。

- **採用理由**: SEO 的にも問題なく、最もシンプル
- **代替案**:
  - `/stock-items` の同じ画面を `/` でも render → URL の一貫性が悪く、二重ブックマーク等の混乱
  - クライアント側 `useEffect` 内 `router.push` → 一瞬の白い画面が出る

### モーダル backdrop: Tailwind v4 slash 構文 + 明示 z-index

`bg-black/50` (slash 構文) で半透明黒、`z-50` で前面、`aria-modal="true"` で a11y 担保。

- **採用理由**: Tailwind v4 公式構文、問題箇所をピンポイント修正
- **代替案**: 専用のモーダルライブラリ（react-modal / radix-ui）を導入 → 過剰

### モーダルのテキスト色: FilterBar と統一

`text-gray-900 placeholder:text-gray-400` を input / select に付与。Tailwind v4 の `text-gray-900` は `oklch(0.225 0.039 250)` 相当で十分濃い。

### デフォルトカテゴリ: prop による外部注入

`CreateItemModal` の `category` state の初期値を、props で受け取った `initialCategory` から作る。呼出側 `page.tsx` で次のロジックを適用:

```ts
const initialCategory = filter.category ?? "★";
```

- **採用理由**: 単純、テスト可能、フィルタとカテゴリの結合度が最小
- **代替案**: `CreateItemModal` 内部で filter を直接読む → page.tsx と modal の責務がにじむ

### 「選択してください」プレースホルダ option の扱い: 削除

`<option value="">選択してください</option>` を削除。理由:
- 常にデフォルト値が入るので、空状態は発生しない
- `required` attribute との整合（空を選ばせたくない）

カテゴリは常にいずれかの値が選ばれている状態でモーダルが開く。

## Risks / Trade-offs

- **PWA に Service Worker が無い** → オフライン動作不可。家族用途で許容範囲、後で追加可能
- **アイコンが 1 サイズしか無い** → ブラウザのダウンスケールで多少のジャギ。許容範囲、後で別サイズ追加可能
- **Root redirect で SEO 影響** → 個人利用で SEO の重要度低、`/stock-items` を canonical とする
- **「選択してください」削除** → ユーザーが「未選択にする」操作を選べなくなる。ただし `required` が成立する以上、未選択の使用シーンはない

## Migration Plan

1. ユーザーが `frontend/public/icon.png` (512×512 PNG) を用意
2. PR でコード変更を入れる（テスト含む）
3. CI 通過を確認
4. ローカルで dev サーバー起動 → `/` redirect、PWA メタデータ、モーダル動作を手動確認
5. PR ready for review → merge
6. archive

ロールバック: 1 PR にまとまっているので revert 可能。本番に未デプロイのため影響範囲は dev のみ。
