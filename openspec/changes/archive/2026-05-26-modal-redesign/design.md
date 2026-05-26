## Context

現在 CreateItemModal・EditItemModal・UrlRegistrationModal の3コンポーネントはそれぞれ独立実装されており、オーバーレイ・背景スクリム・`isOpen` による条件レンダリングが3箇所に重複している。デザインも最小限の Tailwind で構築されており、モバイル最適化・アニメーションは存在しない。framer-motion は既存インストール済み（v12）。

## Goals / Non-Goals

**Goals:**
- BaseModal に共通ロジックを集約してコード重複を排除
- モバイル（〜639px）: ボトムシート＋framer-motion slide-up アニメーション
- デスクトップ（640px〜）: センターダイアログ＋framer-motion fade+scale アニメーション
- Minimal Elevated スタイルへの統一（border-2 入力欄、uppercase ラベル、rounded-xl ボタン）
- 既存テストをすべてパスさせる

**Non-Goals:**
- ドラッグでシートを閉じる（スワイプジェスチャー）
- ポータル（ReactDOM.createPortal）への移行
- UrlRegistrationModal の機能追加・変更

## Decisions

### D-1: BaseModal コンポーネントで共通化

**決定**: 共通ラッパー `BaseModal` を新規作成し、3モーダルがこれを使う。

**理由**: オーバーレイ・アニメーション・ヘッダーの3要素は完全に共通。各モーダルは form の中身だけを children として渡せばよく、見た目の一貫性も自動的に担保される。

**代替案**: 3モーダルそれぞれを独立修正 → スタイルの乖離が再発しやすく却下。

---

### D-2: framer-motion の AnimatePresence でアニメーション管理

**決定**: `AnimatePresence` + `motion.div` を BaseModal 内で使い、入場・退場アニメーションを管理する。

**理由**: framer-motion は既にインストール済みで、`AnimatePresence` により unmount タイミングを framer-motion が制御するため、退場アニメーション中のコンポーネント保持を手動で管理する必要がない。CSS transition のみでは exit アニメーションに追加のステート管理が必要になる。

**モバイル**: `y: "100%" → 0`（slide-up）300ms ease-out / 退場 250ms ease-in  
**デスクトップ**: `opacity: 0, scale: 0.95 → 1, 1`（fade+scale）200ms ease-out / 退場 150ms ease-in  
**スクリム**: `opacity: 0 → 0.5` fade

---

### D-3: Tailwind sm: ブレークポイントでレスポンシブ切り替え

**決定**: `sm:` (640px) を境界にボトムシート ↔ センターダイアログを切り替える。

**理由**: iPhone 15 Pro の論理幅は 393px であり sm: (640px) より小さい。iPad mini (768px) は sm: を超えるためデスクトップ扱いになり適切。Tailwind の標準ブレークポイントを使うことで追加設定不要。

---

### D-4: ボタンレイアウト

**モバイル**: `flex gap-3` 横並び。キャンセル `flex-1`・プライマリ `flex-[2]`。  
**デスクトップ**: `flex gap-2 justify-end`（既存と同様）。  
**理由**: モバイルは親指で届きやすい大きなタップターゲットを優先。デスクトップは右寄せが標準 UX。

## Risks / Trade-offs

- **既存テストの DOM 構造変化** → 既存テストは `role="dialog"` や `aria-modal` などのセマンティクスで要素を探しているため、BaseModal でもこれらを維持する。テスト修正が必要な場合は最小限に留める。
- **framer-motion v12 の API 変更** → v12 は v11 から breaking changes あり。使用する `AnimatePresence`・`motion.div`・`variants` は変更なし。ただしインポートパスを確認してから実装する。
- **UrlRegistrationModal の複雑性** → 4ステート（idle/streaming/nameSelection/error）を持つため、BaseModal の children として渡す部分が大きくなる。ロジックはそのまま維持し、JSX の構造のみ変更する。

## Migration Plan

1. BaseModal 実装 → テスト追加
2. EditItemModal（最もシンプル）で BaseModal を使って動作確認
3. CreateItemModal（画像プレビュー・wantToBuy トグルあり）に適用
4. UrlRegistrationModal（ステート多数）に適用
5. 全テスト通過確認 → dev server で手動確認

ロールバック: BaseModal への移行は各ファイル独立なので、問題が出たファイルだけ旧実装に戻せる。
