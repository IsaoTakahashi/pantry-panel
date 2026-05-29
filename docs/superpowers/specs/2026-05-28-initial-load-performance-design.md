# 初回ロードパフォーマンス改善 — 設計ドキュメント

## 背景

本番環境（Vercel）で初回アクセス時に白い画面が続く問題が確認された。
Playwright による計測で以下の2点が主因として特定された：

1. Auth ロード中に `AuthGuard` が `null` を返すため、JSバンドル読み込み完了後も白い画面が続く
2. `StockItemsClient` が4つのモーダルコンポーネントを静的 import しており、初回ロード時に不要なコードも読み込まれる

Lambda コールドスタートは cron-job.org による Lambda `/health` ping（5分ごと）で別途対処済み。

## スコープ

- `frontend/` のみ。バックエンドは変更なし
- 変更対象ファイル: `StockItemsClient.tsx`

## 変更内容

### 1. AuthGuard loading 中のスケルトン表示

**現状:**
```
StockItemsClient renders → <AuthGuard> returns null (authLoading=true) → 白い画面
```

**変更後:**
`StockItemsClient` の先頭に早期リターンを追加する。`authLoading=true` のとき既存の `StockItemsSkeleton` を返す。

```tsx
// StockItemsClient.tsx に追加
if (authLoading) return <StockItemsSkeleton />;
return <AuthGuard>...</AuthGuard>;
```

- `AuthGuard` のインタフェースは変更しない
- スケルトンは auth 確認完了まで表示し、完了後は既存の items loading スピナーに引き継ぐ（ユーザー選択: B）
- `StockItemsSkeleton` はすでに `StockItemsClient` と同ディレクトリに存在する

### 2. モーダルコンポーネントの動的インポート

**現状:** 4つのモーダルが静的 import → 初回バンドルに含まれる

**変更後:** `next/dynamic` で遅延ロードに変更

```ts
const CreateItemModal = dynamic(() => import("@/components/CreateItemModal"));
const EditItemModal = dynamic(() => import("@/components/EditItemModal"));
const ImageSelectionModal = dynamic(() => import("@/components/ImageSelectionModal"));
const UrlRegistrationModal = dynamic(() => import("@/components/UrlRegistrationModal"));
```

- モーダルはユーザーが開くまで表示されないため、遅延ロードによる UX 影響なし
- `ssr: false` は不要（これらは既に `"use client"` コンポーネント内で使用されており、SSR されない）

## 変更しないもの

- `AuthGuard` コンポーネント — インタフェース変更なし
- `StockItemsSkeleton` — そのまま使用
- framer-motion — v12 はツリーシェイクが改善済みのため今回は対象外

## テスト方針

変更はレンダリングロジックのみで、既存の E2E・Unit テストがカバーする範囲に変化なし。
追加テストは不要。ローカルで `npx playwright test` を実行して既存 E2E がパスすることを確認する。
