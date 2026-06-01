# preconnect-hints Specification

## Purpose
`layout.tsx` の `<head>` に preconnect / dns-prefetch リソースヒントを埋め込み、Lambda API・Supabase Realtime への DNS+TLS 接続を HTML パース中に並列確立することで初回ロードを高速化する。

## Requirements

### Requirement: layout.tsx は API・Realtime への preconnect ヒントを出力する
`NEXT_PUBLIC_API_BASE_URL` および `NEXT_PUBLIC_SUPABASE_URL` が設定されている場合、`layout.tsx` の `<head>` は各ホストに対して `rel="preconnect" crossOrigin="anonymous"` と `rel="dns-prefetch"` の両方を SHALL 出力する。空白のみの値は未設定として扱い、リソースヒントを出力しない MUST。

#### Scenario: 両方の環境変数が設定されている場合
- **WHEN** `NEXT_PUBLIC_API_BASE_URL` と `NEXT_PUBLIC_SUPABASE_URL` がビルド時に設定されている
- **THEN** レンダリングされた HTML の `<head>` に各 URL を `href` とする `<link rel="preconnect" crossOrigin="anonymous">` と `<link rel="dns-prefetch">` が含まれる（合計 4 つの `<link>` タグ）

#### Scenario: API URL のみ設定されている場合
- **WHEN** `NEXT_PUBLIC_API_BASE_URL` のみビルド時に設定されている
- **THEN** `<head>` に API URL の preconnect / dns-prefetch ヒントが 2 つ出力され、Supabase の `<link>` は含まれない

#### Scenario: Supabase URL のみ設定されている場合
- **WHEN** `NEXT_PUBLIC_SUPABASE_URL` のみビルド時に設定されている
- **THEN** `<head>` に Supabase URL の preconnect / dns-prefetch ヒントが 2 つ出力され、API の `<link>` は含まれない

#### Scenario: 環境変数が未設定の場合
- **WHEN** `NEXT_PUBLIC_API_BASE_URL` と `NEXT_PUBLIC_SUPABASE_URL` が両方未設定
- **THEN** `<head>` にリソースヒント用の `<link>` タグが含まれない

#### Scenario: 空白のみの URL はヒントを出力しない
- **WHEN** `NEXT_PUBLIC_API_BASE_URL` が空白のみの文字列（例: `"   "`）に設定されている
- **THEN** `<head>` にリソースヒント用の `<link>` タグが含まれない

### Requirement: preconnect ヒントは CORS モードに対応した crossOrigin 属性を持つ
`rel="preconnect"` の `<link>` タグは `crossOrigin="anonymous"` を MUST 持つ。これにより fetch API が使用する CORS 接続プールと preconnect が確立した接続が共有される。

#### Scenario: crossOrigin 属性の確認
- **WHEN** `NEXT_PUBLIC_API_BASE_URL` が設定されている
- **THEN** API URL の `<link rel="preconnect">` タグに `crossOrigin="anonymous"` が含まれる
