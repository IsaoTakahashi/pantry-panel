# confirm-dialog Specification

## Purpose
TBD - created by syncing change frontend-best-practice. Update Purpose after archive.

## Requirements

### Requirement: ConfirmDialog が確認ダイアログを表示する
`ConfirmDialog` コンポーネントは、破壊的操作の実行前にユーザーの確認を求める SHALL。`BaseModal` を基底として使用し、既存のモーダル UX（framer-motion アニメーション、backdrop）と一貫した見た目を持つ MUST。

#### Scenario: ConfirmDialog が isOpen=true で表示される
- **WHEN** `isOpen` prop が `true` になる
- **THEN** ダイアログが表示され、`message` props のテキストと「確認」「キャンセル」ボタンが表示される

#### Scenario: キャンセルボタンで onCancel が呼ばれる
- **WHEN** ユーザーが「キャンセル」ボタンをクリックする
- **THEN** `onCancel` コールバックが呼ばれる
- **AND** ダイアログが閉じる

#### Scenario: 確認ボタンで onConfirm が呼ばれる
- **WHEN** ユーザーが「確認」ボタンをクリックする
- **THEN** `onConfirm` コールバックが呼ばれる
- **AND** ダイアログが閉じる

#### Scenario: isOpen=false のときダイアログは表示されない
- **WHEN** `isOpen` prop が `false` になる
- **THEN** ダイアログが DOM から除去される（exit animation 後）

### Requirement: ConfirmDialog の削除用デフォルトテキスト
削除確認用途では、`message` にアイテム名を含む確認文を渡す SHALL。ConfirmDialog 自体はメッセージ内容を決めず、呼び出し側が `message` を指定する MUST。

#### Scenario: 削除確認として使用する
- **WHEN** `message="「{商品名}」を削除しますか？"` を渡して ConfirmDialog を表示する
- **THEN** そのメッセージが表示される
- **AND** 「確認」「キャンセル」ボタンで操作を選べる
