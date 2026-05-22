## Context

URL から商品を登録する機能（`POST /api/extract-from-url`）はすでに実装済みだが、以下の問題がある。

1. **エラー時の情報不足**: フロントエンドはエラー時に HTTP ステータスコードだけで分岐し、レスポンス body を読まない。バックエンドも `"failed to fetch the target page"` 等の汎用文字列しか返さないため、実際の失敗理由（Jina の HTTP 429、Claude が JSON を返せなかった、など）が Surface されない。
2. **登録元 URL の未保存**: `stock_items` テーブルに `source_url` カラムが存在せず、URL 登録した商品が後から参照できない。

## Goals / Non-Goals

**Goals:**
- バックエンドのエラーレスポンスに `detail`（技術的な失敗理由の文字列）を追加する
- フロントエンドのエラー表示に「詳細を表示」折り畳みセクションを追加する
- `stock_items` テーブルに `source_url TEXT` (nullable) を追加し、CRUD 全体でサポートする
- `ItemCard` に `sourceUrl` がある場合のみ外部リンクアイコンを表示する

**Non-Goals:**
- SSE による処理進捗のリアルタイム表示（改善4）
- Claude による商品名候補の生成（改善2）
- 抽出アルゴリズム自体の変更
- 既存データへの `source_url` バックフィル

## Decisions

### D1: `detail` フィールドを `ErrorResponse` に追加する（message と別フィールド）

`message` を詳細化する案もあったが、`message` はすでにフロントエンドの分岐に使われておらず（HTTP ステータスで分岐）、後方互換を保ちながら UI での表示制御を分けるために別フィールドとする。

```go
type ErrorResponse struct {
    Message string `json:"message"`
    Detail  string `json:"detail,omitempty"` // 技術的な失敗詳細
}
```

`detail` は `omitempty` にし、バックエンドが詳細を持たない場合（validation エラー等）は省略する。

### D2: `source_url` は `TEXT` nullable カラム（stock_items に直接追加）

別テーブル（URL 履歴）にする案もあるが、現時点では 1 アイテムに最大 1 URL で十分。URL を変更したい場合は Update で上書きする。NULL は「URL 登録でない商品」を表す。

### D3: ItemCard の外部リンクアイコンはアクションボタン列に `sourceUrl` があるときだけ表示

常にスペースを確保する案もあるが、URL 登録していない商品が多い現状では表示密度を下げないために非表示を選択。アイコンは `MdOpenInNew`（`react-icons/md`）を使い、`target="_blank" rel="noopener noreferrer"` で別タブ遷移。

### D4: デプロイ順序はバックエンド先行

`source_url` は nullable なので、バックエンドを先にデプロイしても既存フロントエンドへの影響はない。フロントエンドが `sourceUrl: null` を受け取ってもアイコン非表示で正常動作する。

## Risks / Trade-offs

- **source_url に機密 URL が入る可能性**: 現在は認証なし・家族共用のため許容範囲内。将来 Google 認証導入時には RLS で制御する予定
- **`detail` の内容が変わる可能性**: `detail` はデバッグ用途であり、フロントエンドがその内容をパースして分岐することを禁止する（表示のみ）。文字列フォーマットは非安定 API として扱う

## Migration Plan

1. DB migration を Supabase SQL Editor で実行:
   ```sql
   ALTER TABLE stock_items ADD COLUMN source_url TEXT;
   ```
2. バックエンドをデプロイ（`source_url` 対応 + `detail` フィールド追加）
3. フロントエンドをデプロイ（`sourceUrl` 型追加 + ItemCard アイコン + エラー詳細表示）

ロールバック: `source_url` カラムは DROP 可能（フロントエンドは `null` を graceful に扱う）。

## Open Questions

（なし）
