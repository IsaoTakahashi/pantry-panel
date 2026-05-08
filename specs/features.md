# 機能一覧・実装順

## 旧製品からの変更点

賞味期限機能と在庫増減機能を削除する。

| 削除される要素 | 影響 |
|--------------|------|
| `inventories` 配列 | ストック個数・賞味期限の概念がなくなる |
| 在庫追加モーダル（+ボタン） | 削除 |
| 在庫消費（-ボタン） | 削除 |
| 賞味期限警告（カード黄色表示） | 削除 |
| 在庫切れフィルタ（ベルアイコン） | 根拠となる inventories がなくなるため削除 |
| 削除条件 | 旧: `wantToBuy=false AND inventories空` → 新: `wantToBuy=false` のみ |

## 機能一覧

| # | 機能 | ユーザーシナリオ |
|---|------|-----------------|
| A | 商品一覧表示 | アプリを開くと、登録済みの商品が更新日時順に並んでいる |
| B | 商品登録 | 「商品を追加」から新しい商品を作成できる（名前、カテゴリ） |
| C | 商品削除 | wantToBuy=false の商品を削除できる |
| D | 商品情報編集 | 商品名・カテゴリを変更できる |
| E | 買い物リスト | カートアイコンで wantToBuy をトグルできる |
| F | フィルタリング | テキスト検索、買い物リスト、カテゴリでフィルタできる |
| G | リアルタイム同期 | 家族の誰かが更新すると、他の端末にも即座に反映される |
| H | シンプルビュー | 表示モードを切り替えてコンパクトな一覧で確認できる |
| I | 商品画像設定 | 画像をクリックして Google 画像検索から選択・設定できる |

## 実装順

### Phase 1: 基盤 — データが流れる最小構成

| 順 | 機能 | 理由 |
|----|------|------|
| 1 | A. 商品一覧表示 | DB スキーマ、API、一覧描画を一気通貫で構築。TDD フローの検証も兼ねる |
| 2 | B. 商品登録 | 一覧に表示するデータの作成手段。入力は名前とカテゴリのみ |
| 3 | C. 商品削除 | CRUD の基本完成。削除条件は wantToBuy=false のみでシンプル |

### Phase 2: 編集・整理 — 日常利用に必要な操作

| 順 | 機能 | 理由 |
|----|------|------|
| 4 | D. 商品情報編集 | 名前・カテゴリの個別更新 |
| 5 | E. 買い物リスト | wantToBuy トグル + 更新時刻リフレッシュ。このアプリの中心的な価値 |
| 6 | F. フィルタリング | テキスト検索・カテゴリ・wantToBuy の AND 条件。フロントエンド中心 |

### Phase 2.5: 初回デプロイ — 本番環境の立ち上げ

Phase 1–2 で実装した機能を本番（Vercel + AWS Lambda + Supabase）で動かす。Phase 3.5 のリアルタイム同期（Supabase Realtime）に必要な常時稼働 / 公開 URL を提供する。

| 構成要素 | サービス | 備考 |
|----------|----------|------|
| Frontend | Vercel | Next.js native、無料枠で十分 |
| Backend | AWS Lambda + Lambda Web Adapter | container image (ECR) + Function URL、Free Tier ~月 \$0 |
| DB | Supabase Postgres | 無料枠。Lambda は Supavisor Session Pooler 経由で接続（Direct Connection は IPv6 のため Lambda 不可） |
| CI/CD | GitHub Actions → 各サービス | PR 単位の preview は別 change で検討 |

> 経緯メモ: 当初は AWS App Runner、次に AWS ECS Express Mode を予定したが、それぞれ「新規受付停止 (App Runner)」「コスト過大・vCPU クォータ 0 でブロック (ECS Express)」の問題があり、最終的に Lambda + LWA を採用。詳細は `openspec/changes/archive/` 配下の各 change 履歴を参照。

この時点では Phase 1–2 の機能が本番で動くことを目標とする。認証は wishlist 扱いで導入しない (旧仕様の「認証なし・家族共用」を維持)。

#### サブフェーズ進行状況

| サブフェーズ | 内容 | 状態 |
|-------------|------|------|
| 2.5a | Supabase 接続セットアップ（ローカル動作確認まで） | ✅ 完了 |
| 2.5b | Backend を AWS Lambda + LWA にデプロイ（Dockerfile + ECR + Function URL） | 🟢 実装中 |
| 2.5c | Frontend を Vercel にデプロイ（NEXT_PUBLIC_API_BASE_URL + CORS 更新） | ✅ 完了 |
| 2.5d | Backend 自動デプロイ（GitHub Actions + OIDC） | ✅ 完了 |

### Phase 3: リアルタイム同期 — 学習目的の自前 WebSocket 実装（本番ルート外）

| 順 | 機能 | 理由 |
|----|------|------|
| 7 | G. リアルタイム同期 (学習) | WebSocket + LISTEN/NOTIFY を **学習目的** で自前実装する。本番には載せない |

**位置づけの変更（重要）:**

当初は Phase 3 で本番リアルタイム機構を構築する計画だったが、Phase 2.5b で Backend を Lambda + LWA に移行したことで、常時稼働の WebSocket は backend で持てなくなった（Lambda 実行時間 15 分制限、コネクション維持コスト等）。これを機に **本番のリアルタイム機構は Phase 3.5（Supabase Realtime）に集約** し、Phase 3 は **学習目的のローカル / CI 動作確認のみ** に格下げする。

**実装方針:**
- Backend: `backend/learning/websocket/` に隔離、`//go:build learning` build tag で通常ビルドから除外。CI は `-tags=learning` で別 job 実行
- Frontend: `frontend/src/learning/websocket-client/` に隔離、`*.learning.test.ts` 命名と vitest 別 config で通常開発からは除外。CI は別 job 実行
- 各ディレクトリに `README.md` で「学習ログである」「変更は依存追従のみ」「本番には載せない」を明示
- Phase 3 終了時点に `git tag learning-archive-v1` を打ってスナップショットを残す
- 動作確認は **ローカルの compose Postgres** + **ローカルの Go サーバ** + **ローカルの Frontend** で完結する。本番（Lambda / Supabase Pooler）には載せない

### Phase 3.5: Supabase Realtime — 本番のリアルタイム機構

Frontend が Supabase Realtime を購読し、Postgres の `stock_items` 変更を直接受信する。Backend は変更通知の経路には介在せず、CRUD REST API のみを提供する。

**実装方針:**
- Frontend に `@supabase/supabase-js` を導入し、`stock_items` テーブルの Realtime publication を購読
- 変更受信時に：
  - 受信ペイロードを直接画面に反映（小規模なので十分）
  - もしくは backend REST API で再取得（authorization が必要な操作のみ）
- Supabase Dashboard で `stock_items` の Realtime を有効化
- Lambda 経由の REST CRUD は変更なし（書込は引き続き backend 経由）

### Phase 4: 表示・付加機能

| 順 | 機能 | 理由 |
|----|------|------|
| 8 | H. シンプルビュー | フロントエンドのみの変更 |
| 9 | I. 商品画像設定 | 外部 API 連携が必要。コアではないため最後 |
