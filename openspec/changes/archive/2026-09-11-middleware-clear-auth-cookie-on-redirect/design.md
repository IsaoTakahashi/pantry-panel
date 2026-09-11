## Context

`middleware.ts` の `isDefinitelyUnauthenticated` は2つの経路から true になる（135-142行目）:

1. `data === null && error === null`（本当に未ログイン、cookie が最初から無い）
2. `data === null && error !== null` かつ `error` が `Retryable`/`RefreshDiscarded` のどちらでもない（例: `AuthInvalidJwtError`。getClaims() がエラー付きで resolve され、`@supabase/ssr` の `setAll()` は呼ばれない）

いずれの経路でも現状 `redirectResponse` は `sb-*-auth-token` cookie をそのまま `response.cookies.getAll()` からコピーする（165-167行目）だけで、明示的なクリアはしていない。ブラウザ側 (`frontend/src/lib/supabaseClient.ts`) は `createBrowserClient`（`@supabase/ssr`）を使っており middleware と同じ cookie を読むため、cookie が残ると client 側 `getSession()` がセッションありと判定し `/login` → `/stock-items` に押し戻す（Issue #260 のループ）。

`@supabase/ssr` は大きなセッションを `sb-<project-ref>-auth-token.0`, `.1` ... のようにチャンク分割して cookie に保存することがある。cookie 名は project ref に依存するため、固定名ではなく命名パターンで判定する必要がある。

## Goals / Non-Goals

**Goals:**
- `isDefinitelyUnauthenticated` による redirect 時、request に存在する `sb-*-auth-token`（チャンク含む）cookie を `redirectResponse` 上で確実に失効させる
- 既存の cookie 転記ロジック（165-167行目、リフレッシュ結果の引き継ぎ）を壊さない
- 上記2経路（(1) 本当に未ログイン、(2) 確定的無効エラー）のうち、実際に cookie が残置される経路を実装前に検証してから直す

**Non-Goals:**
- `LoginContent`（`frontend/src/app/login/page.tsx`）側のロジック変更（client 側は cookie が無くなれば追従して直るため、変更不要と想定）
- fail-open の判定基準自体の変更（`isDefinitelyUnauthenticated` の算出ロジックは対象外）
- Issue #261（AuthGuard のフラッシュ問題）はスコープ外。別 change として扱う

## Decisions

- **クリア対象の判定はパターンマッチで行う**: cookie 名の固定文字列比較ではなく、`/^sb-.+-auth-token(\.\d+)?$/` 相当のパターンで `request.cookies.getAll()` を走査し、一致するものをすべて `redirectResponse.cookies.set(name, "", { ...options, maxAge: 0 })` で失効させる。理由: project ref が cookie 名に含まれるため固定名では拾えず、チャンク分割された cookie を取りこぼすと部分的にセッションが復元可能な cookie が残ってしまう
- **クリア処理は既存のコピーループ（165-167行目）より後に実行する**: 先に実行すると `response.cookies.getAll()` の転記で上書きされてしまうため
- **どちらの経路で cookie が残置されるかは実装時に空実装で書いたテストの RED/GREEN で確認する**: 「(1) 本当に未ログイン」は `@supabase/ssr` が内部で `setAll()` 経由で既にクリアしている可能性がある一方、「(2) 確定的無効エラー」は `setAll()` が呼ばれず cookie が残ると想定している。両方の経路にテストケースを用意し、実際にどちらが red になるかで実装対象を確定する（`testing.md` の "discriminator が実際に機能するか検証してから実装する" 方針に従う）

## Risks / Trade-offs

- [Risk] パターンマッチが緩すぎて無関係な cookie を消してしまう → Mitigation: `sb-` prefix + `-auth-token` suffix（数値サフィックス許容）に限定し、既存テスト（S-7 のリフレッシュ cookie 等）が引き続き green であることを確認する
- [Risk] クリアのタイミングを誤り、リフレッシュ後の新 cookie を誤って消してしまう → Mitigation: `isDefinitelyUnauthenticated` が true の分岐でのみクリアを実行する（リフレッシュ成功時はこの分岐に到達しない）
- [Trade-off] client 側 (`LoginContent`) の redirect-back ロジックは変更しないため、cookie が残っている限り（本 fix適用前の挙動）ループは理論上再現しうるが、本 fix でその前提（cookie が残る）自体を除去する

## Migration Plan

- 通常のコード変更のみ。DB マイグレーション・段階的ロールアウトは不要
- 既存 E2E（auth.spec.ts 等）に影響しないことを local Vitest で確認してから push する
