## 1. テスト更新（TDD）

- [ ] 1.1 `frontend/src/components/AuthGuard.test.tsx` の `/セッションが切れました/` を含むアサーション（82, 93行目付近）を、design.md で決定した新しい中立文言のアサーションに更新し、この時点で（実装前のため）red になることを確認する
- [ ] 1.2 意図的サインアウト直後に一瞬レンダーされても文言が事実と矛盾しないことを検証するテストケースを追加する（spec.md のシナリオ「意図的なサインアウト直後に一瞬表示されても文言が事実と矛盾しない」に対応。既存のレンダー条件テストの構造に合わせて追加すればよく、新規の見せ方は不要）

## 2. 実装

- [ ] 2.1 `frontend/src/components/AuthGuard.tsx` のフォールバックUI（24-41行目付近）の文言を、design.md で決定した中立文言に変更する（「セッションが切れました」という確定的な事実主張を削除）
- [ ] 2.2 1.1/1.2 のテストが green になることを確認し、`AuthGuard.test.tsx` の他のテスト（レンダー条件・no-group リダイレクト等）が引き続き green であることを確認する

## 3. 検証・レビュー

- [ ] 3.1 `cd frontend && npx vitest run src/components/AuthGuard.test.tsx` で green を確認する
- [ ] 3.2 コードレビュー sub-agent で変更差分をレビューする
- [ ] 3.3 commit・push し、`gh pr checks --watch` で CI が green であることを確認する

## 4. 完了処理

- [ ] 4.1 `openspec archive` で本 change をアーカイブし、`specs/auth-guard/spec.md` に MODIFIED Requirements を反映する（PR マージ前、同一ブランチで実施。移動元ディレクトリの削除を必ず `git add`/`git rm` でステージすること — Issue #267 の再発防止）
