## Context

- `buildSessionCookies` は、セッションを `base64-` + base64url(JSON) に変換し、`@supabase/ssr` の `createChunks` で分割する。`readAccessTokenFromCookies` はその逆で、`combineChunks` で結合し、デコードして `access_token` を取り出す。失敗はすべて `null` で表す
- `@supabase/ssr`（0.12.x）の chunker の挙動:
  - `createChunks` は `encodeURIComponent(value)` の長さが `MAX_CHUNK_SIZE`（3180、パッケージのエントリから export されている）以下なら `key` 1 個、超えれば `key.0`、`key.1`、… に分割する。base64url の文字は URI エンコードで長さが変わらないため、cookie 値の長さがそのまま分割の判定に使われる
  - `combineChunks` は、分割されていない `key` に値があればそれを優先して返す。なければ `key.0` から連番で、最初に欠けた番号の手前までを連結する
- `readAccessTokenFromCookies` の冒頭の `new URL(supabaseUrl)` は try の外にあるため、不正な URL では例外になる。これはプロパティの対象外（入力として正しい Supabase URL を前提とする）

## Goals / Non-Goals

**Goals:**
- fast-check を導入し、Vitest の既存テストと同じ実行経路（`npm test`、CI）で動かす
- 往復のプロパティで、chunk が複数個になるケースを確実に生成し、実際に生成されていることを確かめる

**Non-Goals:**
- `@supabase/ssr` 自体の chunker の正しさの検証（このアプリのコードが依存している前提として扱う）
- `toCookieHeader` のプロパティ化（単純な join で価値が小さい）
- 他の Sub-Issue（#322〜#325）の対象

## Decisions

1. **fast-check を直接使い、`@fast-check/vitest` は使わない**
   `it` の中で `await fc.assert(fc.asyncProperty(...))` を呼ぶだけで十分で、依存を増やさない。`@fast-check/vitest` は vitest 5 との peer 範囲の確認が必要になる。
   - バージョン: `fast-check@4.10.2`（2026-09-19 公開、2 週間以上経過）
2. **テストは別ファイル `sessionCookie.property.test.ts` に置く**
   既存の例ベースのテスト（`sessionCookie.test.ts`）と分けて、何がプロパティなのかを読みやすくする。Vitest の既定の include（`*.test.ts`）に合うことを確認する。
3. **生成器は現実の入力の範囲に合わせる**
   - project ref: 英小文字と数字のラベル（`new URL()` が例外を投げない範囲）
   - `access_token`: JWT 形式（base64url 3 区画を `.` でつないだ文字列）
   - セッションの大きさ: `user_metadata` に Unicode 全域の文字列（日本語・絵文字を含む）を入れ、さらに長さを `fc.integer` で指定したパディングを足す。`MAX_CHUNK_SIZE` の倍数の前後（±数文字）を重点的に生成する
   - fast-check v4 の既定の文字列は短いため、長さを明示しないと分割の経路をまったく通らない。`fc.statistics` などで、複数 chunk のケースが実際に生成されていることを確認する
4. **混入のプロパティの期待値は、`combineChunks` の挙動から決める**
   - 分割されていない `key` と `key.N` が同時にあるとき: 分割されていない方が使われる
   - 古い `key.N` が末尾に残っているとき・途中の chunk が欠けているとき: 正しいトークン、または `null` のどちらかで、例外を投げない（どちらになるかはデコード結果に依存するため、厳密な値は期待しない）
   - 名前の完全一致で cookie を引くため、並び順や別の project ref の cookie が結果に影響しないのは構造上明らか。安価な確認として残すが、網羅性の根拠とはしない
5. **プロパティが実際に効くことを確かめる**
   実装を一時的に壊し（`base64-` の除去をやめる、結合後の文字列を切り詰める、など）、プロパティが失敗することを確認してから元に戻す。この一時的な変更はコミットしない。

## Risks / Trade-offs

- [大きな入力でテストが遅くなる] → `numRuns` を調整し、ファイル全体で数秒以内に収める
- [ランダム性で CI が不安定になる] → 失敗時は fast-check が seed と縮小済みの反例を出力するので、それを例ベースのテストとして固定する
- [`@supabase/ssr` の更新で chunker の挙動が変わる] → 混入のプロパティは「例外を投げない」を基本の期待値にしているので、優先順位の変更には強い。往復が壊れた場合は実際の不具合なので、テストが落ちるのが正しい
