## Why

SSR の初回取得（`getInitialStockItems.ts`）は、Supabase クライアントを使わずに `frontend/src/lib/sessionCookie.ts` の `readAccessTokenFromCookies` でアクセストークンを取り出している（#308）。ここで読み取りに失敗すると初回表示が遅くなり、誤った値を返すと Go API の 401 を経由した強制ログアウトにつながる。にもかかわらず、既存テストは手で選んだ数例だけで、cookie の分割境界・マルチバイト文字・古い chunk の残りといった実際に起こる入力をほとんど試していない。プロパティベーステスト Epic（#316）の最初の Issue（#321）として、fast-check を導入し、この往復処理を網羅的に検証する。

## What Changes

- frontend に dev dependency として `fast-check` を追加する（このリポジトリで初めてのプロパティベーステスト）
- `buildSessionCookies` / `readAccessTokenFromCookies` に対するプロパティベーステストを追加する
  - 往復: 任意のセッションを分割して結合すると、元の `access_token` に戻る（chunk が 1 個・複数個の両方を確実に生成する）
  - 分割境界: `MAX_CHUNK_SIZE` の前後の長さでも往復が成り立つ
  - 旧形式: `base64-` 接頭辞のない生 JSON の cookie からも読み取れる
  - 混入: 無関係な cookie・別の project ref の cookie・同じ project ref の古い chunk が混ざっても、例外を投げない
  - 壊れた入力: chunk の欠け、base64 / JSON として不正な値、`access_token` が文字列でない、のいずれでも `null` を返し、例外を投げない
- プロダクションコードの振る舞いは変えない。テストで不具合が見つかった場合のみ修正し、その時点で spec を追加する

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

（なし）

テストの追加のみで、spec レベルの振る舞いは変わらないため、`.openspec.yaml` に `skip_specs: true` を設定する。

## Impact

- `frontend/package.json` / `package-lock.json`: `fast-check` を devDependencies に追加
- `frontend/src/lib/sessionCookie.property.test.ts`（新規）
- プロダクションコード・API・UI への影響なし。E2E の対象外

## ユーザーシナリオとテスト設計

（test-design agent が作成する）
