## Why

デフォルトの汎用アイコン（`icon.png`）を使用しており、ホーム画面に追加したときにアプリらしい印象を与えられていない。アプリのメインカラー（teal: `#00d1b2`）を背景に、「食品棚」を連想させる白抜きピクトグラムへ刷新する。

## What Changes

- `frontend/public/icon.svg` を新規作成（背景色 `#00d1b2` + 白抜き3段棚ピクトグラム）
- `frontend/public/icon-192.png` / `icon-512.png` を SVG から生成（旧 `icon.png` を削除）
- `frontend/src/app/favicon.ico` を新アイコンで更新
- `manifest.ts` のアイコン参照を 192px / 512px の 2 サイズに分離
- `layout.tsx` の favicon / apple-touch-icon 参照を更新

## Capabilities

### New Capabilities

なし

### Modified Capabilities

- `frontend-pwa`: アイコンファイルを `icon.png` から `icon-192.png` / `icon-512.png` / `icon.svg` に変更し、favicon も新デザインで更新する

## Impact

- `frontend/public/`: `icon.png` 削除、`icon.svg` / `icon-192.png` / `icon-512.png` 追加
- `frontend/src/app/favicon.ico`: 更新
- `frontend/src/app/manifest.ts`: icons 配列を 2 エントリに更新
- `frontend/src/app/layout.tsx`: icons メタデータを更新
- `frontend/scripts/generate-icons.mjs`: PNG / ICO 生成スクリプト（一時的に使用、コミット後は不要だが履歴に残す）
