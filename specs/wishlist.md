# Wishlist（将来追加を検討する機能）

実装は未定。優先度や実現可能性は別途判断する。設計・実装する際は、ユーザーシナリオの検討から行うこと。
実装が完了したものはこのページからは削除し、`wishlist-implemented.md`に移動させる

## UX改善


## AI による商品登録

### URL 登録機能の改善

URL から商品登録する機能（`/api/extract-from-url`）に対する改善。

---

#### 改善2: 長い商品名の候補選択 UI

**背景:** 現在、抽出した name が 25 文字以上の場合に Jina 経由で名前を短くしようとするが、精度が低い。代わりに Claude に短縮候補を複数生成させ、ユーザーが選ぶ UI にする。

**変更内容:**

- バックエンド: `extractor.go` から「name >= 25 文字 → Jina で補完」のロジックを削除する。代わりに name >= 25 文字のとき 2nd Claude コールで短縮候補 3 つを生成し、レスポンスに `nameCandidates: string[]` を追加する（短い場合は省略）
  ```json
  { "name": "ポッカサッポロ キレートレモン 155ml缶×24本入", "imageUrl": "...", "nameCandidates": ["キレートレモン 155ml×24", "ポッカ ビタチャージW 24缶", "キレートレモン ウコン+鉄"] }
  ```
- 2nd Claude コールのプロンプト: 元の name から 15 文字以内の候補 3 つを JSON 配列で返す
- フロントエンド (`UrlRegistrationModal`): `nameCandidates` が返ってきたとき `"nameSelection"` ステートに移行し、3 候補＋元の名前から 1 つを選ばせるUIを表示する。選択後は既存の `CreateItemModal` に渡す
- `UrlRegistrationModal` の step 条件（「name >= 25 文字のとき step2 に移行」）も合わせて削除する

**実装工数**: M（2〜4日）

---

#### 改善4: 抽出処理の途中経過表示

**背景:** `/api/extract-from-url` は最大 4 ステップ・15〜20 秒かかる可能性があるが、現在は「解析中...」スピナーのみで進捗が不明。

**変更内容:**

- バックエンド: 新エンドポイント `POST /api/extract-from-url/stream` を追加し、SSE（Server-Sent Events）で各ステップ開始時にイベントを配信する。既存の `POST /api/extract-from-url` は後方互換のため維持する
  - `event: progress` / `data: {"step":"fetching","message":"ページを取得中..."}`
  - `event: progress` / `data: {"step":"fetching_jina","message":"別の方法でページを取得中..."}` （Jina fallback 時のみ）
  - `event: progress` / `data: {"step":"extracting","message":"商品情報を解析中..."}`
  - `event: progress` / `data: {"step":"generating_candidates","message":"名前の候補を生成中..."}` （name >= 25 文字時のみ）
  - `event: done` / `data: {"name":"...","imageUrl":"...","nameCandidates":[...]}` （完了）
  - `event: error` / `data: {"kind":"fetchFailed","message":"...","detail":"..."}` （エラー）
- フロントエンド: `fetch` + ReadableStream で SSE を受信（EventSource は POST 非対応のため）。進捗ステップをリスト表示し、完了済み・進行中・未着手を視覚的に区別する

**実装工数**: M（3〜5日）  
**考慮事項**: Lambda Function URL はストリーミングレスポンスに対応済み。Echo での SSE 実装は `c.Response().Writer` への直接書き込みで実現できる。

### レシピからの材料一括登録

料理のレシピ Web ページの URL を入力すると、材料一覧を AI で抽出し、調味料を除いた食材を商品として一括登録する。

**実装工数**: M（3〜5日）  
**前提条件**: 「Web ページからの商品登録」が実装済みであること。スクレイピング・AI API の基盤を流用できるため、差分は一括確認 UI とプロンプト調整のみ。

## データの更新履歴をもつ

更新履歴(特にwant-to-buy操作)をもたせることで、「最後にこの商品を買ったのはいつか」などを把握できる。
単純な wantToBuy の ON/OFF と「その商品を買ったから OFF にする」という操作を区別できるようにする。

**実装工数**: M（3〜5日）  
**UI デザイン**: wantToBuy=ON のとき、カートボタンがセグメントボタン（✓ 青塗り｜↩ 白抜き）に変形する。✓ で「買った」として履歴記録、↩ で記録なしに OFF。詳細は [want-to-buy-history-ui.html](./want-to-buy-history-ui.html) 参照。

## ToDo リスト

お買い物リスト（wantToBuy）とは別タブで、「やること・行くお店」を管理する ToDo リスト機能。

**実装工数**: M（3〜5日）  
既存機能と独立した標準 CRUD。

