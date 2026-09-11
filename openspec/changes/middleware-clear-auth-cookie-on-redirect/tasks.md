## 1. 事前検証（どちらの経路で cookie が残置されるか）

- [ ] 1.1 `middleware.test.ts` に、request に `sb-<ref>-auth-token` cookie（および `.0`/`.1` チャンク）を持たせた状態で、(a) `data===null && error===null` と (b) `AuthInvalidJwtError` resolve の両方について「redirectResponse が該当 cookie を失効させているか」を確認する RED テストを書き、現状の実装でどちらが red になるかを確認する（design.md の想定どおり (b) のみ red になるはずだが、実装前に実測する）

## 2. テスト設計・実装（TDD）

- [ ] 2.1 1.1 の結果を踏まえ、実際に cookie が残置される経路について `middleware.test.ts` に正式なテストケースを追加する（既存 S-3 相当シナリオの拡張。cookie 名はチャンク分割ケースも含める）
- [ ] 2.2 `middleware.ts` の `isDefinitelyUnauthenticated` redirect 分岐（156-172行目）に、`request.cookies.getAll()` を `sb-` prefix + `-auth-token`（数値サフィックス許容）のパターンでフィルタし、`redirectResponse` 上で失効させる処理を、既存の cookie コピーループ（165-167行目）より後に追加する
- [ ] 2.3 追加したテストが green になることを確認し、既存の全テスト（S-7 のリフレッシュ cookie 反映テスト等）が引き続き green であることを確認する

## 3. 検証・レビュー

- [ ] 3.1 `cd frontend && npx vitest run src/middleware.test.ts` で対象テストが green であることを確認する
- [ ] 3.2 コードレビュー sub-agent で変更差分をレビューする
- [ ] 3.3 commit・push し、`gh pr checks --watch` で CI（Biome → tsc → Vitest）が green であることを確認する

## 4. 完了処理

- [ ] 4.1 `openspec archive` で本 change をアーカイブし、`specs/ssr-session-auth/spec.md` に MODIFIED Requirements を反映する（PR マージ前、同一ブランチで実施）
