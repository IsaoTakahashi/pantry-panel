# グループ管理機能 設計ドキュメント

**作成日**: 2026-05-20  
**対象機能**: グループ名編集 / 複数グループ作成・切り替え

---

## 概要

以下の2機能を追加する。

1. **グループ名の編集**（オーナーのみ）
2. **複数グループの作成・切り替え**

ユーザーは複数グループに同時所属可能。アクティブグループはクライアントサイド（localStorage）で管理し、ヘッダーのドロップダウンで切り替える。

---

## Section 1: DB・バックエンドリポジトリ

### DB 変更

スキーマ変更なし。`groups` / `group_members` テーブルは現状のままで複数グループ対応できる。

### リポジトリ変更

`GroupRepository` インターフェースに以下を追加・変更する。

```go
// FindMembershipsByUserID はユーザーが所属する全グループを返す（複数対応）
// 既存の FindMembershipByUserID（単数、LIMIT 1）は削除して統一する
FindMembershipsByUserID(ctx context.Context, userID uuid.UUID) ([]GroupMembership, error)

// UpdateGroupName はグループ名を更新する（所有者確認はハンドラ側で実施）
UpdateGroupName(ctx context.Context, groupID uuid.UUID, name string) error
```

### JWT ミドルウェア変更

- **`jwtGroupMW`**: リクエストの `X-Active-Group-ID` ヘッダーを読み取り、`FindMembershipsByUserID` の結果でそのユーザーが当該グループのメンバーであることを検証してから `authInfo.GroupID` にセットする。ヘッダー未送信・不正UUID・非メンバーの場合は 403 を返す。
- **`jwtOnlyMW`**: グループチェックなし（変更なし）。

### API エンドポイント

| メソッド | パス | 変更内容 |
|---------|------|---------|
| `GET /api/groups/me` | 全所属グループ一覧を返すよう変更（複数対応） |
| `POST /api/groups` | 既存グループがあっても作成可能に変更（409 チェックを削除） |
| `PATCH /api/groups/:id` | 新規追加。グループ名変更（オーナーのみ。非オーナーは 403） |

`PATCH /api/groups/:id` のリクエスト/レスポンス：

```json
// Request
{ "name": "新しいグループ名" }

// Response 200
{ "id": "...", "name": "新しいグループ名", "createdAt": "..." }
```

---

## Section 2: フロントエンド — 状態管理

### `AuthContext` の変更

```ts
// 変更前
group: GroupInfo | null

// 変更後
groups: GroupInfo[]           // 所属全グループ
group: GroupInfo | null       // アクティブグループ
switchGroup: (groupId: string) => void
```

### アクティブグループの永続化

localStorage キー: `pantry-panel:active-group-id`

ログイン時の復元ロジック：

1. localStorage のIDが `groups` の中に存在 → そのグループをアクティブに
2. 存在しない（削除・脱退等） → `groups[0]` をアクティブに
3. `groups` が空 → `/no-group` にリダイレクト

### `lib/api.ts` の変更

全 API 呼び出しに `X-Active-Group-ID` ヘッダーを付与する。現在の `accessToken` と同様に、各関数の引数として `activeGroupId: string | undefined` を受け取る形とする。`activeGroupId` が undefined の場合はヘッダーを付与しない（`jwtOnlyMW` を使うエンドポイント向け）。

### `authApi.ts` の変更

| 関数 | 変更内容 |
|------|---------|
| `fetchMyGroup` | `fetchMyGroups` に改名。`GroupInfo[]` を返すよう変更 |
| `createGroup` | 409 エラーハンドリングを削除 |
| `updateGroupName` | 新規追加。`PATCH /api/groups/:id` を呼ぶ |

---

## Section 3: フロントエンド — UI

### ヘッダーのドロップダウン

現在のヘッダーの `<span>{group.name}</span>` をクリッカブルなドロップダウンに変更する。

```
[ Pantry Panel ]          [ ▾ 我が家 ] [ 招待 ] [ サインアウト ]
                          ↓ クリック
                         ┌──────────────────────┐
                         │ ✓ 我が家（オーナー）  │ ← アクティブ（チェックマーク）
                         │   実家（メンバー）    │
                         │ ──────────────────── │
                         │ ＋ 新しいグループを作成│
                         └──────────────────────┘
```

- チェックマーク（✓）はアクティブグループを示す
- 各グループ行をクリックするとアクティブグループが切り替わり、stock items が再取得される
- 新グループ作成後は作成したグループが自動的にアクティブになる

### インライン名前編集（オーナーのみ）

アクティブグループがオーナーのとき、ドロップダウン内のグループ名をクリックすると `<input>` に切り替わる。Enter キーまたは blur で API を呼び出して保存。ESC でキャンセル。

```
                         ┌──────────────────────┐
                         │ ✓ [我が家________] ✔ │ ← 編集中
                         │   実家（メンバー）    │
                         │ ──────────────────── │
                         │ ＋ 新しいグループを作成│
                         └──────────────────────┘
```

### `no-group` ページ

`groups` が空（未所属）の場合のみ表示。現在のページをそのまま流用し、変更不要。

### 新コンポーネント

`frontend/src/components/GroupSwitcher.tsx`

- `groups: GroupInfo[]`, `activeGroupId: string`, `onSwitch`, `onCreateGroup`, `onRenameGroup` を props として受け取る
- `stock-items/page.tsx` のヘッダーから呼び出す
- 「招待」リンクはアクティブグループがオーナーのときのみ表示（現在の挙動を維持）

---

## Section 4: テスト方針

### バックエンド（Go）

| レイヤー | テスト内容 |
|---------|-----------|
| Repository | `FindMembershipsByUserID` で複数グループを返すことを testcontainers で確認 |
| Repository | `UpdateGroupName` が正しく更新されることを testcontainers で確認 |
| Handler | `PATCH /api/groups/:id` のオーナー検証・非オーナー 403 を unit test で確認 |
| Handler | `POST /api/groups` が既存メンバーでも作成できることを確認 |
| Middleware | `X-Active-Group-ID` が未送信・不正UUID・非メンバーのケースで 403 を返すことを unit test で確認 |

### フロントエンド（Vitest + RTL）

| テスト対象 | テスト内容 |
|-----------|-----------|
| `AuthContext` | `switchGroup` で `group` が切り替わり localStorage に保存されることを確認 |
| `AuthContext` | ログイン時に localStorage からアクティブグループを復元することを確認 |
| `GroupSwitcher` | グループ一覧の表示・切り替えクリック・インライン編集の動作を RTL で確認 |
| `authApi` | `fetchMyGroups` / `updateGroupName` の API 呼び出しを確認 |
