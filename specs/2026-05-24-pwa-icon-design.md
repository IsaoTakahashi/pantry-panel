# PWA アイコン改善 設計書

## 概要

PWA ホーム画面アイコン・favicon を「食品庫・パントリー」を連想させるピクトグラムに刷新する。

## デザイン決定

### 形状: 3段棚（ミニマル）

ブレインストーミングで A1-R1 案を採用。

```
┌─────────────────┐
│  [瓶]   [瓶]    │  ← 上段: 縦長角丸矩形×2
├─────────────────┤
│  [──oval──] [缶]│  ← 中段: 横長楕円 + 細缶
├─────────────────┤
│  [──box──] [box]│  ← 下段: 横長箱 + 小箱
└─────────────────┘
```

- 外枠: 角丸矩形（rx=6）、stroke のみ（塗りなし）
- 棚板: 2本の水平線
- アイテム: 白塗り。大きめ・少なめでアイコン小サイズでも潰れない

### カラー

| 要素 | 値 |
|------|-----|
| 背景 | `#00d1b2`（アプリのメインカラー teal） |
| 図柄 | `#ffffff`（白抜き） |

### SVG ソース（viewBox="0 0 82 82"）

ピクトグラム部分のみ。実ファイルでは先頭に `<rect width="82" height="82" rx="14" fill="#00d1b2"/>` を追加して背景を含める。

```svg
<svg width="82" height="82" viewBox="0 0 82 82" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- frame -->
  <rect x="9" y="9" width="64" height="64" rx="6" stroke="white" stroke-width="5.5" fill="none"/>
  <!-- shelf 1 -->
  <line x1="9" y1="33" x2="73" y2="33" stroke="white" stroke-width="4.5"/>
  <!-- shelf 2 -->
  <line x1="9" y1="55" x2="73" y2="55" stroke="white" stroke-width="4.5"/>
  <!-- top: 2 tall jars -->
  <rect x="17" y="13" width="14" height="16" rx="4" fill="white"/>
  <rect x="37" y="13" width="14" height="16" rx="4" fill="white"/>
  <!-- middle: wide oval + narrow can -->
  <rect x="20" y="37" width="22" height="14" rx="6" fill="white"/>
  <rect x="47" y="37" width="12" height="14" rx="4" fill="white"/>
  <!-- bottom: wide box + small box -->
  <rect x="21" y="59" width="20" height="9" rx="3" fill="white"/>
  <rect x="46" y="60" width="12" height="7" rx="3" fill="white"/>
</svg>
```

## 成果物ファイル

| ファイル | 用途 | サイズ |
|---------|------|--------|
| `frontend/public/icon.svg` | マスターソース | — |
| `frontend/public/icon-192.png` | PWA manifest 用 | 192×192 |
| `frontend/public/icon-512.png` | PWA manifest 用 | 512×512 |
| `frontend/src/app/favicon.ico` | ブラウザタブ | 32×32 相当 |

既存の `frontend/public/icon.png` は削除し、manifest・layout の参照を更新する。

## コード変更箇所

### `frontend/src/app/manifest.ts`

```ts
icons: [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
],
```

### `frontend/src/app/layout.tsx`

```ts
icons: {
  icon: "/icon.svg",
  apple: "/icon-192.png",
},
```

## 実装方針

1. `public/icon.svg` を作成（背景付き: `<rect fill="#00d1b2"/>` + ピクトグラム）
2. Node.js スクリプト（sharp）で SVG → PNG をエクスポート（192px / 512px）
3. `favicon.ico` を 32px PNG から生成（sharp で PNG 出力 → `to-ico` パッケージで ICO 変換）
4. manifest.ts・layout.tsx を更新
5. 旧 `icon.png` を削除
