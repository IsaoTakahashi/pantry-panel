## ADDED Requirements

### Requirement: BaseModal がレスポンシブ挙動を提供する
BaseModal コンポーネントは画面幅に応じてボトムシート（モバイル）とセンターダイアログ（デスクトップ）を自動切り替えする SHALL。

#### Scenario: モバイルでボトムシートが表示される
- **WHEN** 画面幅が 639px 以下の状態でモーダルが開かれる
- **THEN** モーダルは画面下部にボトムシートとして表示され、上部に pill 型のドラッグハンドルが描画される

#### Scenario: デスクトップでセンターダイアログが表示される
- **WHEN** 画面幅が 640px 以上の状態でモーダルが開かれる
- **THEN** モーダルは画面中央にダイアログとして表示される

### Requirement: BaseModal が入場・退場アニメーションを提供する
BaseModal は framer-motion を使用した滑らかな入場・退場アニメーションを提供する SHALL。

#### Scenario: モバイルの入場アニメーション
- **WHEN** モバイルでモーダルが開かれる
- **THEN** シートが画面下から slide-up する（300ms ease-out）

#### Scenario: デスクトップの入場アニメーション
- **WHEN** デスクトップでモーダルが開かれる
- **THEN** ダイアログが fade + scale-up する（200ms ease-out）

#### Scenario: 退場アニメーション
- **WHEN** モーダルが閉じられる
- **THEN** 入場と逆方向のアニメーションが完了してからコンポーネントがアンマウントされる

### Requirement: BaseModal がキーボードとオーバーレイ操作で閉じられる
BaseModal は標準的な閉じる操作をすべてサポートする SHALL。

#### Scenario: Esc キーで閉じる
- **WHEN** モーダルが開いている状態で Esc キーが押される
- **THEN** onClose が呼ばれてモーダルが閉じる

#### Scenario: オーバーレイクリックで閉じる
- **WHEN** モーダルが開いている状態で背景スクリムがクリックされる
- **THEN** onClose が呼ばれてモーダルが閉じる

### Requirement: 各モーダルが BaseModal を使用する
CreateItemModal・EditItemModal・UrlRegistrationModal はすべて BaseModal をラップして使用する SHALL。

#### Scenario: CreateItemModal が BaseModal を使用する
- **WHEN** CreateItemModal が描画される
- **THEN** BaseModal のタイトル・ヘッダー・閉じるボタン・アニメーションが適用されている

#### Scenario: EditItemModal が BaseModal を使用する
- **WHEN** EditItemModal が描画される
- **THEN** BaseModal のタイトル・ヘッダー・閉じるボタン・アニメーションが適用されている

#### Scenario: UrlRegistrationModal が BaseModal を使用する
- **WHEN** UrlRegistrationModal が描画される
- **THEN** BaseModal のタイトル・ヘッダー・閉じるボタン・アニメーションが適用されている
