## Why

商品追加・編集・URL登録の3つのモーダルがそれぞれ独立実装されており、デザインの一貫性・コードの重複・モバイル UX の質に課題がある。家庭用アプリとしてスマートフォン（iPhone 15 Pro 基準）での利用がメインであるため、モバイル最適化と統一感のあるモダンデザインへの刷新が必要。

## What Changes

- **BaseModal コンポーネント新規作成**: オーバーレイ・アニメーション・ヘッダー・閉じるボタンを集約した共通基盤
- **モーダルのレスポンシブ挙動**: モバイル（〜639px）はボトムシート（slide-up）、デスクトップ（640px〜）はセンターダイアログ（fade + scale）
- **framer-motion によるアニメーション**: 入場・退場アニメーションを既存の framer-motion で実装
- **フォームスタイル統一**: 入力欄・ラベル・ボタンを Minimal Elevated スタイルに統一
- **CreateItemModal リファクタ**: BaseModal を使用するよう書き換え
- **EditItemModal リファクタ**: BaseModal を使用するよう書き換え
- **UrlRegistrationModal リファクタ**: BaseModal を使用するよう書き換え。ストリーミング progress UI も新スタイルに

## Capabilities

### New Capabilities
- `modal-ux`: レスポンシブ対応の共通モーダル基盤（BaseModal）と、モバイルボトムシート／デスクトップセンターダイアログの切り替え挙動

### Modified Capabilities
- `ui-style-guide`: モーダル内のボタン・入力欄・ラベルスタイルの要件更新（Minimal Elevated スタイル、uppercase ラベル、border-2 入力欄）

## Impact

- `frontend/src/components/BaseModal.tsx`（新規）
- `frontend/src/components/CreateItemModal.tsx`（変更）
- `frontend/src/components/EditItemModal.tsx`（変更）
- `frontend/src/components/UrlRegistrationModal.tsx`（変更）
- 既存テスト（`*.test.tsx`）は動作を維持したまま通過させる
- 新規依存ライブラリなし（framer-motion は既存インストール済み）
