## 1. SVG アイコン作成

- [x] 1.1 `frontend/public/icon.svg` を作成（背景 `#00d1b2` + 白抜き3段棚ピクトグラム）

## 2. PNG / ICO 生成スクリプト

- [x] 2.1 `frontend/scripts/generate-icons.mjs` を作成（sharp で SVG → 192px / 512px PNG 生成、to-ico で 32px ICO 生成）
- [x] 2.2 `sharp` と `to-ico` を devDependencies に追加（`npm install --save-dev sharp to-ico`）
- [x] 2.3 スクリプトを実行して `icon-192.png` / `icon-512.png` / `favicon-32.ico` を生成・確認

## 3. アイコンファイルをコミット

- [x] 3.1 生成した `frontend/public/icon-192.png` / `icon-512.png` / `icon.svg` をリポジトリに追加
- [x] 3.2 生成した `frontend/src/app/favicon.ico` をリポジトリに追加（既存 ICO を置き換え）

## 4. コード更新

- [x] 4.1 `frontend/src/app/manifest.ts` の `icons` を `icon-192.png`（192×192）と `icon-512.png`（512×512）の 2 エントリに更新
- [x] 4.2 `frontend/src/app/layout.tsx` の `icons` を `icon: "/favicon.ico"`、`apple: "/icon-192.png"` に更新
- [x] 4.3 旧 `frontend/public/icon.png` を削除

## 5. 動作確認

- [x] 5.1 `npm run dev` でローカル起動し、ブラウザタブの favicon が新デザインになっていることを確認
- [x] 5.2 DevTools → Application → Manifest でアイコンが 2 サイズ表示されることを確認
- [ ] 5.3 変更をプッシュし、PR 上の CI（Biome / tsc / Vitest）が通ることを確認
