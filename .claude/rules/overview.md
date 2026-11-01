# Overview

家庭の食品・日用品の在庫を管理するWebアプリ。Google ログイン（Supabase Auth）必須で、データは**グループ**（家族）単位で分離する。

## アーキテクチャ

```
[Supabase Auth (Google OAuth)]
        │ JWT（cookie に保持、@supabase/ssr）
        ▼
[Next.js (Vercel)] ───────────────► [Supabase Realtime (Phase 3.5)]
        │ Authorization: Bearer <JWT>     ▲
        ▼                              │
[Go API (AWS Lambda + LWA)]            │
   ├── JWT 検証 + グループ所属チェック  │
   └── REST endpoints (CRUD)           │
        │                              │
        ▼                              │
[Supabase Postgres] ───────────────────┘
   ├── RLS でグループ単位にアクセス制御
   └── Direct row changes broadcast via Realtime
```

## 認証・グループ

- Frontend は `@supabase/ssr` で cookie ベースのセッションを持ち、`middleware.ts` と `AuthGuard` で未認証時をログイン画面へ誘導する
- Backend は `backend/middleware/auth.go` で JWT（Supabase JWKS）を検証し、`stock_items` 等のエンドポイントはアクティブグループへの所属を要求する
- グループは作成・切り替え・招待（`/api/groups`、`/api/invitations`）に対応。詳細は `specs/features.md` の Phase 6 を参照

## 技術スタック

| 役割 | 技術 |
|------|------|
| Frontend | Next.js (TypeScript) / Vercel |
| Backend API | Go (Echo) / **AWS Lambda + Lambda Web Adapter** (container image, ECR) |
| API 形式 | REST のみ。リアルタイムは Frontend が Supabase Realtime に直接購読（Phase 3.5） |
| Database | Supabase Postgres（Lambda は **Supavisor Session Pooler** 経由で接続、IPv4） |
| 認証 | Supabase Auth（Google OAuth）+ Go 側 JWT 検証 + Postgres RLS |
| インフラ | Vercel + AWS Lambda + Supabase |

## リアルタイム同期の仕組み

旧製品の Firebase Realtime Database を **Supabase Realtime** で再現する。Backend は介在せず、Frontend が Supabase Realtime に直接購読して Postgres の変更を受信する。

### Phase 3 (学習目的、本番ルート外): 自前 WebSocket 実装

学習として Go + WebSocket + PostgreSQL LISTEN/NOTIFY を自前実装する。**ローカル / CI でのみ動作確認** し、本番（Lambda）には載せない。

### Phase 3.5 (本番): Supabase Realtime

- Frontend が `@supabase/supabase-js` 経由で `stock_items` テーブルの行変更を購読
- 変更検知時に画面を更新（or REST 再取得）
- Backend は CRUD REST API のみ。リアルタイム経路には関与しない

