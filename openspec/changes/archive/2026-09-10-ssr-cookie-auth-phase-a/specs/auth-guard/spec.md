## MODIFIED Requirements

### Requirement: 確定結果に基づいてのみリダイレクトする
`AuthGuard` は `loading` が `false` になった後の確定済み `group` の状態のみに基づいてリダイレクトを判断する SHALL。`speculativeGroupId` の有無はリダイレクト判断に使用しない MUST。未ログイン時のリダイレクトは `middleware`（`ssr-session-auth` capability）が担い、`AuthGuard` はこれを行わない MUST NOT。

#### Scenario: loading 完了後にグループが無ければ no-group へリダイレクトする
- **WHEN** `loading` が `false` になり `session` はあるが `group` が `null` である(推測グループIDの有無に関わらず)
- **THEN** `/no-group` へリダイレクトする

#### Scenario: loading 中は推測グループIDだけでリダイレクトしない
- **WHEN** `loading` が `true` である
- **THEN** `speculativeGroupId` の有無に関わらずリダイレクトは発生しない
