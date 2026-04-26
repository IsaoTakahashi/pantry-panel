# Overview

家庭の食品・日用品の在庫を管理するWebアプリ。認証なし・家族共用の想定（Google 認証は wishlist で別途検討中）。

## アーキテクチャ

```
[Next.js (Vercel)]
        │
        ▼
[Go API (AWS App Runner)]
   ├── REST endpoints (CRUD)
   └── (Phase 3 のみ) WebSocket + PostgreSQL LISTEN
        │
        ▼
[Supabase Postgres]
   ├── (Phase 3) NOTIFY triggers
   └── (Phase 3.5 以降) Supabase Realtime
```

## 技術スタック

| 役割 | 技術 |
|------|------|
| Frontend | Next.js (TypeScript) / Vercel |
| Backend API | Go (Echo) / AWS App Runner |
| API 形式 | REST + (Phase 3 自前 / Phase 3.5 以降 Supabase Realtime) |
| Database | Supabase Postgres |
| インフラ | Vercel + AWS App Runner + Supabase |

## リアルタイム同期の仕組み

旧製品の Firebase Realtime Database を 2 段階で再現する。

### Phase 3: 自前 WebSocket 実装（学習目的）

1. クライアントAがREST APIで更新リクエストを送信
2. Go APIがDBを更新し、PostgreSQL NOTIFY を発行
3. Go APIが LISTEN で通知を受信（Supabase への direct connection が必須）
4. WebSocket 接続中の全クライアントに変更を配信

### Phase 3.5 以降: Supabase Realtime に切替（本番）

- Frontend が Supabase Realtime クライアントで Postgres の変更を直接購読する
- 自前 WebSocket + LISTEN/NOTIFY 実装は `learning/` 配下に隔離し、CI でのみ動作確認する（詳細は `specs/features.md` Phase 3.5 を参照）

## デプロイ

| 環境 | サービス | 備考 |
|------|----------|------|
| Frontend | Vercel | Next.js native、無料枠 |
| Backend | AWS App Runner | コンテナ常駐、WebSocket 対応 |
| DB | Supabase | 無料枠、direct connection で LISTEN/NOTIFY 可 |

初回デプロイは Phase 2.5（Phase 2 完了直後・Phase 3 着手前）で行う。詳細は `specs/features.md` を参照。
