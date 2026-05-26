## MODIFIED Requirements

### Requirement: モーダルダイアログの可読性
モーダルダイアログ内のすべてのテキスト・ラベル・入力欄は、十分なコントラストと余白を持ち、可読性の高い状態で表示される SHALL。

#### Scenario: モーダルタイトルの視認性
- **WHEN** モーダルが開かれる
- **THEN** タイトルは `text-lg font-extrabold` 以上の太さで `tracking-tight` を持ち、`text-slate-900` で表示される

#### Scenario: ラベルとコントラスト
- **WHEN** 入力欄のラベルが描画される
- **THEN** ラベルは `text-xs font-bold text-slate-400 uppercase tracking-widest` スタイルで表示される（背景白に対して WCAG AA 以上のコントラスト）

#### Scenario: 入力欄のフォーカス状態
- **WHEN** 入力欄がフォーカスされる
- **THEN** `border-2` のボーダーがアクセント色（`focus:border-[#00d1b2]`）に変化する

#### Scenario: ボタン配置（モバイル）
- **WHEN** モバイル（〜639px）でモーダル下部にボタンが描画される
- **THEN** ボタンは横並び（`flex gap-3`）で、キャンセルが `flex-1`・プライマリアクションが `flex-[2]` の幅比率で配置される

#### Scenario: ボタン配置（デスクトップ）
- **WHEN** デスクトップ（640px〜）でモーダル下部にボタンが描画される
- **THEN** ボタンは右寄せ（`flex justify-end gap-2`）で配置される

## ADDED Requirements

### Requirement: モーダルボタンの形状
モーダル内のボタンは `rounded-xl` の大きな角丸を持ち、`py-2.5 text-sm font-bold` のサイズとなる SHALL。

#### Scenario: プライマリボタンの形状
- **WHEN** モーダルのプライマリアクションボタンが描画される
- **THEN** `rounded-xl py-2.5 text-sm font-bold bg-[#00d1b2] hover:bg-[#00c4a7] text-white` スタイルで表示される

#### Scenario: キャンセルボタンの形状
- **WHEN** モーダルのキャンセルボタンが描画される
- **THEN** `rounded-xl py-2.5 text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-600` スタイルで表示される
