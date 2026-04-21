# Overview

家庭の食品・日用品の在庫を管理するWebアプリ。認証なし・家族共用の想定。

## アーキテクチャ

```
[Next.js (Amplify / CloudFront)]
        │
        ▼
[Go API (ECS Fargate / App Runner)]
   ├── REST endpoints (CRUD)
   ├── WebSocket endpoint (リアルタイム同期)
   └── PostgreSQL LISTEN
        │
        ▼
[Aurora PostgreSQL Serverless v2]
   └── NOTIFY triggers
```

## 技術スタック

| 役割 | 技術 |
|------|------|
| Frontend | Next.js (TypeScript) |
| Backend API | Go (Echo) |
| API 形式 | REST + WebSocket |
| Database | PostgreSQL (Aurora Serverless v2) |
| インフラ | AWS |

## リアルタイム同期の仕組み

旧製品の Firebase Realtime Database を REST + WebSocket + PostgreSQL LISTEN/NOTIFY で再現する。

1. クライアントAがREST APIで更新リクエストを送信
2. Go APIがDBを更新し、PostgreSQL NOTIFY を発行
3. Go APIが LISTEN で通知を受信
4. WebSocket 接続中の全クライアントに変更を配信
