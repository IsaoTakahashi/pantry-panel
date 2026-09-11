## Why

`AuthContext.signOut()`（`frontend/src/contexts/AuthContext.tsx:166-190`）は `setSession(null)` を呼んだ直後に `router.replace("/login")` でナビゲーションする。この2つの状態更新はナビゲーション完了前にフラッシュされるため、`AuthGuard`（`frontend/src/components/AuthGuard.tsx:24-41`）が一瞬 `!loading && !session` の分岐に入り、ユーザーが意図的にサインアウトしたにもかかわらず「セッションが切れました。もう一度ログインしてください。」という事実と異なるメッセージが一瞬表示される。サインアウトボタンは `AuthGuard` の subtree 内にあるため、毎回のサインアウトで100%再現する（Issue #258/PR #259 の最終レビューで発見、Issue #261）。

## What Changes

- `AuthGuard` のフォールバックUIの文言を、「意図的なサインアウト直後」と「受動的なセッション喪失（トークン失効・別タブでの signOut 等）」のどちらの文脈で表示されても事実として不自然にならない中立的な文言に変更する（例: 「セッションが切れました」という確定的な事実主張を含めず、単に再ログインを促す文言にする）
- 状態管理（`signingOut` フラグ等）は追加しない。フラッシュ自体（フォールバックUIが一瞬描画されること）は解消しない——解消しようとする状態機械はリセット漏れ（`signOut` 失敗・ナビゲーション中断時にフラグが立ったままになり、フォールバックUIが永久に抑制される）のリスクがあり、元の一瞬フラッシュより悪い失敗モードになりうるため、今回は不採用と判断した（ユーザーとの検討により決定）

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `auth-guard`: 「受動的なセッション喪失時にフォールバックUIを表示する」Requirement の文言を、意図的サインアウト時にも表示されうることを踏まえた中立的な内容に変更する

## Impact

- `frontend/src/components/AuthGuard.tsx`（フォールバックUIの文言、24-41行目付近）
- `frontend/src/components/AuthGuard.test.tsx`（存在すれば文言アサーションを更新。無ければ新規作成）
- E2E は不要（ブラウザ起動なしで Frontend Unit で検証可能。フラッシュの目視確認 E2E は not applicable — 文言変更のみでフラッシュ自体は解消しないため）
