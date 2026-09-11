## 1. 事前検証（どちらの経路で cookie が残置されるか）

- [x] 1.1 `middleware.test.ts` に、request に `sb-<ref>-auth-token` cookie（および `.0`/`.1` チャンク）を持たせた状態で、(a) `data===null && error===null` と (b) `AuthInvalidJwtError` resolve の両方について「redirectResponse が該当 cookie を失効させているか」を確認する RED テストを書き、現状の実装でどちらが red になるかを確認する（design.md の想定どおり (b) のみ red になるはずだが、実装前に実測する）。実測結果: このテストのモック構成（createServerClient を丸ごと差し替え、@supabase/ssr 実装は呼ばれない）では (a)(b) 両方が red になった。middleware.ts 自身は経路によらず cookie を明示的にクリアしていないため

## 2. テスト設計・実装（TDD）

- [x] 2.1 1.1 の結果を踏まえ、実際に cookie が残置される経路について `middleware.test.ts` に正式なテストケースを追加する（既存 S-3 相当シナリオの拡張。cookie 名はチャンク分割ケースも含める）。両経路とも残置されると判明したため S-9 として (a)(b) それぞれの単一 cookie / チャンク cookie の計4ケースを追加
- [x] 2.2 `middleware.ts` の `isDefinitelyUnauthenticated` redirect 分岐（156-172行目）に、`request.cookies.getAll()` を `sb-` prefix + `-auth-token`（数値サフィックス許容）のパターンでフィルタし、`redirectResponse` 上で失効させる処理を、既存の cookie コピーループ（165-167行目）より後に追加する
- [x] 2.3 追加したテストが green になることを確認し、既存の全テスト（S-7 のリフレッシュ cookie 反映テスト等）が引き続き green であることを確認する。`npx vitest run src/middleware.test.ts` は14件全green、`npx vitest run`（全体）は32ファイル374件全green

## 3. 検証・レビュー

- [x] 3.1 `cd frontend && npx vitest run src/middleware.test.ts` で対象テストが green であることを確認する。14/14 green（実装 sub-agent が確認済み）
- [x] 3.2 コードレビュー sub-agent で変更差分をレビューする。medium レベルで実施、指摘0件（clean）
- [x] 3.3 commit・push し、`gh pr checks --watch` で CI（Biome → tsc → Vitest）が green であることを確認する。PR #266、全 check green（CI/E2E/E2E Preview/Learning）

## 4. 完了処理

- [x] 4.1 `openspec archive` で本 change をアーカイブし、`specs/ssr-session-auth/spec.md` に MODIFIED Requirements を反映する（PR マージ前、同一ブランチで実施）
