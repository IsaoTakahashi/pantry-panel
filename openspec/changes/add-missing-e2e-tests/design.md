## Context

Playwright を使った E2E テストがすでに存在する（stock-items / image-selection / url-registration / realtime-sync）。テストは Mock（localhost:3000）と Preview（Vercel Preview URL）の2プロジェクトに分かれており、全テストは `global-setup.ts` でSupabase 認証を済ませた `.auth/user.json` を `storageState` として受け取って起動する。

既存の編集・フィルタ・ログアウトフローに E2E がなく、回帰リスクが高い。

## Goals / Non-Goals

**Goals:**
- D-1/D-2（商品編集）、K-4（ログアウト）、F-1〜F-5（フィルタリング）のE2Eテストを Mock 環境に追加する
- 本番コードには一切手を加えない

**Non-Goals:**
- Preview 環境（外部API）は不要（今回のシナリオはすべて Mock で完結）
- バックエンドやインフラの変更
- 既存テストのリファクタリング

## Decisions

### 1. テストデータの管理方針

各テストが独立してデータを作成・削除する（グローバル fixtures なし）。

- `Date.now()` を名前に埋め込んでテスト間の衝突を防ぐ
- `test.afterEach` で cleanup するか、テスト末尾で削除する（既存パターンに合わせる）

代替案: `beforeAll` で1セットのデータを使い回す → 複数テストが同じアイテムに依存するとテスト順序の影響を受けるため不採用

### 2. 編集ボタンのセレクタ

`ItemCard` の編集ボタン（名前・カテゴリを表示している中央の `<button>`）には `aria-label` がない。アクセシブルネームはボタン内のテキストコンテンツ（"カテゴリ 商品名"）から自動計算される。

実装では以下のいずれかで特定する（実装時に確認）:
- `page.getByRole("article", { name: itemName }).getByRole("button", { name: new RegExp(itemName) })`
- `page.getByRole("article", { name: itemName }).locator("button.\\[class\\*=text-left\\]")`

### 3. K-4 テストの分離

`signOut` を呼ぶと当該テストの browserContext の localStorage が消える。Playwright はデフォルトで各テストに独立した context を割り当てるため、他テストへの影響はないが、念のため K-4 は stock-items.spec.ts の最後に置く。

### 4. フィルタテストのファイル分割

フィルタ関連は `filter.spec.ts` として独立させる。stock-items.spec.ts は CRUD フローに集中し、フィルタ操作が混入することを防ぐ。

## Risks / Trade-offs

- **リアルな Supabase DB を使用**: Mock 環境でも backend → Supabase に接続するため、テスト中に他ユーザーのデータが混入するリスクがある。一意な名前と group_id（storageState に設定済み）でスコープを絞る。
- **編集ボタンの aria-label なし**: セレクタが脆くなる可能性。実装者がより堅牢なセレクタを選択すること。将来的に `aria-label` を ItemCard に追加するのが望ましいが、本変更のスコープ外とする。
