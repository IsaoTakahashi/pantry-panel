# Modal Redesign Design

**Date:** 2026-05-26
**Scope:** CreateItemModal, EditItemModal, UrlRegistrationModal

## Overview

3つのモーダル（商品追加・編集・URL登録）を統一感のあるモダンなデザインに刷新する。デザイン方針は「Minimal Elevated」スタイル＋モバイル優先の UX。

## Design Decisions

### スタイル方向性
- Minimal Elevated（Notion / Linear 風）
- 大きめの角丸（`rounded-2xl`）、太めのシャドウ
- ラベルは `uppercase`・`tracking-wide`・小サイズの gray
- 入力欄は `border-2 rounded-xl`、focus 時に teal ボーダー（`focus:border-[#00d1b2]`）に変化

### レスポンシブ挙動
| ブレークポイント | 挙動 |
|---|---|
| `< sm`（〜639px）| ボトムシート：画面下から slide-up。ドラッグハンドル（pill）付き |
| `sm`（640px〜）| センターダイアログ：fade + scale-up |

**モバイル基準幅:** iPhone 15 Pro 論理幅 393px

### ボタンレイアウト
- **モバイル（ボトムシート）:** 横並び。キャンセル `flex-1`、プライマリアクション `flex-[2]`。テキストは折り返しなしで収まること（実装後セルフレビューで確認必須）
- **デスクトップ（センターダイアログ）:** `justify-end` 右寄せ、既存と同様

### アニメーション

既存の `framer-motion`（v12）を使用する。`AnimatePresence` + `motion.div` で退場アニメーションも自然に扱える。

- **モバイル入場:** `y: "100%" → y: 0`（slide-up）、duration 0.3s、ease-out
- **モバイル退場:** `y: 0 → y: "100%"`（slide-down）、duration 0.25s、ease-in
- **デスクトップ入場:** `opacity: 0, scale: 0.95 → opacity: 1, scale: 1`、duration 0.2s、ease-out
- **デスクトップ退場:** `opacity: 1, scale: 1 → opacity: 0, scale: 0.95`、duration 0.15s、ease-in
- スクリム（背景）は `opacity: 0 → 0.5` で fade

---

## Architecture

### BaseModal コンポーネント（新規作成）

3モーダルで重複しているオーバーレイ・アニメーション・閉じるボタンのロジックを `BaseModal` に集約する。

**Props:**
```ts
type BaseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};
```

**責務:**
- 背景スクリム（`bg-black/50`）
- レスポンシブ挙動の切り替え（ボトムシート / センターダイアログ）
- 入場・退場アニメーション
- ヘッダー（タイトル＋閉じるボタン）
- モバイルのドラッグハンドル（pill）
- `Esc` キーで閉じる

各モーダルは `BaseModal` をラップし、フォームコンテンツだけを `children` として渡す。

### 変更対象ファイル
| ファイル | 変更内容 |
|---|---|
| `src/components/BaseModal.tsx`（新規） | 共通モーダル基盤 |
| `src/components/CreateItemModal.tsx` | BaseModal を使用するよう書き換え |
| `src/components/EditItemModal.tsx` | BaseModal を使用するよう書き換え |
| `src/components/UrlRegistrationModal.tsx` | BaseModal を使用するよう書き換え |

---

## Component Design Details

### BaseModal

```
[オーバーレイ: fixed inset-0 bg-black/50 z-50]
  └─ [モバイル] シート: fixed bottom-0 w-full rounded-t-2xl bg-white shadow-xl
       ├─ pill ハンドル (w-9 h-1 bg-gray-300 rounded-full mx-auto mt-3)
       ├─ ヘッダー: flex justify-between items-center px-5 pt-3 pb-0
       │    ├─ タイトル: text-lg font-extrabold text-slate-900 tracking-tight
       │    └─ 閉じるボタン: w-7 h-7 rounded-full bg-slate-100 text-slate-500
       └─ コンテンツ: px-5 pb-6 pt-3 (children)

  └─ [デスクトップ] ダイアログ: relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4
       ├─ ヘッダー: flex justify-between items-center px-6 pt-5 pb-0
       │    ├─ タイトル: text-lg font-extrabold text-slate-900 tracking-tight
       │    └─ 閉じるボタン: w-7 h-7 rounded-full bg-slate-100 text-slate-500
       ├─ 区切り線: h-px bg-slate-100 mt-4
       └─ コンテンツ: px-6 pb-6 pt-4 (children)
```

### フォームフィールド共通スタイル

```
label:  block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5
input:  w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900
        focus:border-[#00d1b2] focus:outline-none transition-colors
select: 同上
```

### ボタン共通スタイル

```
キャンセル: flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold
            rounded-xl py-2.5 text-sm transition-colors
プライマリ: flex-[2] bg-[#00d1b2] hover:bg-[#00c4a7] text-white font-bold
            rounded-xl py-2.5 text-sm transition-colors disabled:bg-slate-200
```

モバイル（ボトムシート）: `flex gap-3` の横並び
デスクトップ（センターダイアログ）: `flex gap-2 justify-end`

### UrlRegistrationModal ストリーミング UI

progress ステップリストを薄グレーの背景カードに収める。

```
<div class="bg-slate-50 rounded-xl p-3 space-y-2 mb-4">
  各ステップ: flex items-center gap-2 text-sm
    done:    緑丸チェック + text-slate-400 line-through
    active:  teal スピナー + text-slate-800 font-medium
    pending: グレー丸 + text-slate-300
```

---

## Implementation Self-Review Checklist

実装後に以下を必ず確認する。

- [ ] モバイル（393px 幅）でボトムシートが正しく表示される
- [ ] **ボタンのテキスト（キャンセル・追加・保存・抽出）が 1 行で収まっている**
- [ ] デスクトップでセンターダイアログが表示される（`sm:` ブレークポイント）
- [ ] モバイル入場アニメーション（slide-up）が動作する
- [ ] デスクトップ入場アニメーション（fade + scale）が動作する
- [ ] `Esc` キーでモーダルが閉じる
- [ ] オーバーレイクリックで閉じる
- [ ] 既存テスト（`*.test.tsx`）がすべてパスする
- [ ] URL 登録モーダルのストリーミング・名前選択・エラー各ステートが正しく描画される

---

## Testing

既存の `*.test.tsx` は BaseModal への移行後もすべてパスさせる。新規テストは不要（デザイン変更のみのため）。E2E は既存の Playwright シナリオで回帰テストとして機能させる。
