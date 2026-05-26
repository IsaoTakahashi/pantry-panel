---
paths:
  - "frontend/**"
  - "backend/**"
---
# Testing Strategy

フロントエンド・バックエンドにまたがる全テストスコープの定義と、スコープ選択の判断基準を集約する。実装前のテスト設計（proposal.md の「ユーザーシナリオとテスト設計」セクション）にも参照する。

## テストスコープ定義

| スコープ | ツール | 対象・観点 |
|---------|--------|-----------|
| **Frontend Unit** | Vitest + React Testing Library | 単一コンポーネントの描画・props・状態管理・カスタムhooks・バリデーションロジック |
| **Frontend Integration** | Vitest + React Testing Library | 複数コンポーネントの連携・ページレベルの操作フロー（API は MSW/fetch mock）|
| **E2E Mock** | Playwright (`mock` project, localhost:3000) | ブラウザ操作フロー。外部API は route handler で stub |
| **E2E Preview** | Playwright (`preview` project, Vercel Preview URL) | ブラウザ操作フロー。外部API（Google CSE・Supabase Realtime）を実際に呼ぶ |
| **Backend Unit** | go test | ハンドラ・サービス・バリデーション（DB は mock/stub）|
| **Backend Integration** | go test + testcontainers | DB 操作・SQL クエリ・トランザクション（実 Postgres コンテナ使用）|

## スコープ選択基準（判断ツリー）

```
シナリオが決まったら以下の順に問う:

Q1: ブラウザを起動しないと検証できない？
  ├─ No  → Q3へ（Unit / Integration で検討）
  └─ Yes → Q2へ（E2Eが必要）

Q2: 外部API（Google CSE / Supabase Realtime）が必要？
  ├─ No  → E2E Mock
  └─ Yes → E2E Preview

Q3: 複数コンポーネントをまたぐ連携を検証する？
  ├─ No  → Frontend Unit / Backend Unit
  └─ Yes → Frontend Integration / Backend Integration
```

### E2E を選ぶ代わりに小さいスコープで代替できる条件

- API レスポンス形式が固定（mock で再現できる）→ Frontend Integration で十分
- DOM の確認が props/state の検証で代替できる → Frontend Unit で十分
- HTTP のリクエスト/レスポンスを検証したい（UI不要）→ Backend Unit / Integration

### Mock / Preview の選択基準

| 外部API | 環境 |
|---------|------|
| なし（REST CRUD のみ） | Mock |
| Google Custom Search API（画像検索） | Preview |
| Supabase Realtime（WebSocket 購読） | Preview |
| Supabase Postgres（直接クエリ以外） | Mock |

## テスト設計フォーマット（proposal.md で使用）

proposal.md の「ユーザーシナリオとテスト設計」セクションにはハイブリッド形式を使う。

### テンプレート

```markdown
## ユーザーシナリオとテスト設計

### フロントエンドシナリオ

#### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | <シナリオ名（日本語）> | Mock / Preview / - | E2E / Integration / Unit |

#### S-1: <シナリオ名>
**Given:** <前提状態>
**When:**  <ユーザー操作>
**Then:**  <期待結果>

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock / Preview | <何を確認するか> | <制約・前提> |
| Frontend Unit | <何を確認するか> | — |

**E2E判定:** Yes / No
**理由:** <なぜ E2E が必要 or 不要か>

---

### バックエンドシナリオ

#### サマリ
| # | シナリオ | スコープ |
|---|---------|---------|
| B-1 | <APIレベルのシナリオ名> | Backend Unit / Integration |

#### B-1: <シナリオ名>
**Given:** <前提状態（DBの状態など）>
**When:**  <API 呼び出し（例: POST /stock-items body={...}）>
**Then:**  <期待レスポンス / DB状態>

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Integration | <何を確認するか> | — |
```

### 記載上の注意

- シナリオが 6 件以上になる場合は `e2e-design.md` に切り出し、proposal.md からリンクする
- バックエンドシナリオはユーザー操作シナリオと分けてセクションを立てる（粒度が異なるため）

## 判断基準の更新ログ

レビューでスコープ変更が承認された際は以下の形式で追記する。

```
### YYYY-MM-DD: <変更の概要>
- **対象シナリオ:** <シナリオ名>
- **変更前:** <旧スコープ>
- **変更後:** <新スコープ>
- **理由:** <判断の根拠>
- **一般化した基準:** <次回以降に適用する基準>
```

<!-- ログはここから下に追記する -->

### 2026-05-26: モーダルexit animationとE2Eテストの干渉

- **対象シナリオ:** filter.spec.ts F-4/F-5、stock-items.spec.ts D-1/D-2、url-registration.spec.ts フルフロー
- **変更前:** `createItem()` ヘルパーが article 表示確認後すぐ次の操作へ移る
- **変更後:** `await expect(page.getByRole("dialog")).not.toBeAttached()` を追加して exit animation 完了を待つ
- **理由:** `AnimatePresence` の exit animation（200-300ms）中は dialog の DOM 要素が残存し、Playwright strict mode のロケータが複数要素を解決してエラーになる
- **一般化した基準:**
  1. モーダルを閉じた直後に `page.getBy系` でページ要素を操作する E2E テストは `await expect(page.getByRole("dialog")).not.toBeAttached()` を挟む
  2. 2つのモーダルが一時的に共存するシナリオ（例: URL登録モーダル→作成モーダルの遷移）では `getByRole("dialog")` ではなく内部要素（`getByLabel("名前")` 等）で待機する
  3. `AnimatePresence` を追加・変更したコンポーネントがある場合、関連 E2E テストのモーダル close 後の操作に上記 wait が必要かを確認する
- **tasks.md チェックリスト追加基準:** モーダルやアニメーションを含む変更の tasks.md には以下のタスクを加える
  - `- [ ] 既存E2Eテストのモーダル操作後のlocatorに not.toBeAttached() 待機が必要かを確認する`
  - `- [ ] ローカルで E2E テストを実行してpassすることを確認する（dev server 起動後に npx playwright test）`
