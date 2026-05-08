## Context

Phase 2.5b で Backend が App Runner で本番稼働中。Frontend は現状ローカル `npm run dev` のみで起動可能で、API URL が `localhost:8080` 前提のコードになっている可能性がある。Phase 2.5c では Frontend を Vercel にデプロイし、本番 Backend に接続できる構成にする。Vercel は Next.js 公式の推奨ホスティングで、GitHub 連携で自動デプロイが標準（Phase 2.5d で別途自動化する Backend と異なり、Vercel は最初から自動）。

## Goals / Non-Goals

**Goals:**
- Frontend が Vercel 上で公開されている（`*.vercel.app` で到達可能）
- 環境変数 `NEXT_PUBLIC_API_BASE_URL` で API ベース URL を切り替え可能
- 本番 URL から Backend を経由した CRUD が全て動作する
- main へのマージで自動デプロイが走る（Vercel デフォルト）

**Non-Goals:**
- カスタムドメイン（標準 `*.vercel.app` で開始）
- preview deploy（PR ごとの URL）の活用 — Vercel デフォルトで作られるが、CORS の対応は最低限とする
- Edge Functions / ISR の活用 — Phase 4 以降で必要に応じて
- 監視・パフォーマンス計測（Vercel Analytics）— 別 change

## Decisions

### API URL: `NEXT_PUBLIC_API_BASE_URL` 環境変数駆動

Frontend の fetch 先 base URL を環境変数で外出しする。

- **採用理由**:
  - ローカル開発（localhost）/ Vercel 本番（App Runner URL）/ preview を切り替え可能
  - Next.js 公式の env var パターンに沿う
  - `NEXT_PUBLIC_` プレフィクスでクライアント側でも読める
- **代替案**:
  - `process.env.NODE_ENV` で分岐 → 環境追加時に肥大化、preview に対応できない
  - リバースプロキシで同一 origin 化 → CORS 不要になるが Vercel の rewrite 設定が必要、構成が複雑

### 環境変数の置き方

- 開発: `frontend/.env.local`（コミットしない）に `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`
- 本番: Vercel ダッシュボード → Project Settings → Environment Variables に Production / Preview / Development 用にそれぞれ設定

### preview deploy への CORS 対応: 暫定で本番 URL のみ許可

Vercel preview deploy は PR ごとに URL が変わる（`*-pr-N.vercel.app` 等）。CORS で全部許可すると wildcard が必要になる。

- **採用方針**: Phase 2.5c では本番 URL（`pantry-panel-<account>.vercel.app` 相当）のみ App Runner CORS に追加する。preview deploy は `npm run dev` のローカル相当として割り切る（必要時に App Runner CORS に追記）。
- **代替案**:
  - regex で `*.vercel.app` 全許可 → CORS の wildcard サポート的に複雑、またセキュリティ的に乱用される
  - Vercel preview にも対応する自動 CORS 更新 → Phase 2.5d 以降で検討

### Backend CORS の更新タイミング

Vercel デプロイ完了後、本番 URL を確認してから App Runner の `CORS_ALLOWED_ORIGINS` を更新する。順序を間違えると本番から API が叩けない（CORS エラー）状態が一時的に発生するため。

### Root Directory: `frontend/`

monorepo 構成のため Vercel 側で Root Directory を指定する。

- **採用理由**: backend と frontend が同居しているため、Vercel が backend のファイルを検査しないように Root を絞る。

## Risks / Trade-offs

- **環境変数の漏洩** → `NEXT_PUBLIC_*` はブラウザに露出する。API URL は秘匿情報ではないので問題なし。Backend の DATABASE_URL 等は Frontend には絶対渡さない。
- **本番 URL を Vercel 任せの自動命名にすると、変わるとリンク切れ** → 命名は `pantry-panel-<vercel-account>.vercel.app` 等で固定される想定。Production deployment は alias 固定なので心配薄。
- **CORS の更新忘れで一時的にアプリが動かない** → デプロイ手順書に「Vercel デプロイ完了 → URL 確認 → App Runner 環境変数追記 → App Runner 再デプロイ → 動作確認」を明記する。
- **preview deploy の CORS 不対応** → 開発体験は下がるが、Phase 2.5 のスコープを抑えるため割り切る。

## Migration Plan

1. Frontend のコードを `NEXT_PUBLIC_API_BASE_URL` 駆動に変更（PR で）
2. `frontend/.env.local.example` を追加し `.env.local` の存在を周知
3. Vercel アカウント作成（ユーザー）
4. Vercel プロジェクトを GitHub から import、Root Directory を `frontend/` に設定（ユーザー）
5. Vercel 環境変数 `NEXT_PUBLIC_API_BASE_URL` に App Runner URL を設定
6. main にマージ → Vercel が自動デプロイ → 本番 URL を確認
7. App Runner コンソールで `CORS_ALLOWED_ORIGINS` に Vercel 本番 URL を追記、再デプロイ
8. 本番 URL でアプリを開き、CRUD・wantToBuy・フィルタ・シンプルビューが全て動くことを確認
9. 確認 OK なら Phase 2.5d に進む

ロールバック: Vercel の Deployment 画面から旧 deploy に "Promote to Production" で即時切替え可能。
