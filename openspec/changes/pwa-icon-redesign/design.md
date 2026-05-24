## Context

現在 PWA アイコンは汎用の `icon.png`（単一ファイル、192×192 / 512×512 兼用）を使っている。デザインは Next.js のデフォルトに近く、アプリのブランドカラーを反映していない。

## Goals / Non-Goals

**Goals:**
- アイコンをブランドカラー（`#00d1b2`）背景 + 白抜き3段棚ピクトグラムに更新する
- 192×192・512×512 の 2 サイズを個別ファイルとして提供する
- favicon.ico を同じデザインで更新する

**Non-Goals:**
- マスクable icon（Adaptive Icon）対応（将来対応）
- ダークモード対応アイコン
- アイコン生成スクリプトを CI に組み込むこと

## Decisions

### SVG をマスターソースにする

SVG で描画し、スクリプトで PNG / ICO を生成する。PNG バイナリをリポジトリに直接コミットするが、SVG を手動編集すればいつでも再生成できる。

代替案: デザインツール（Figma 等）でのみ管理 → チームメンバーがツールを持っていなければ再現不能なため却下。

### sharp で PNG 生成、to-ico で ICO 変換

`sharp` は Next.js プロジェクトに既に間接依存として含まれることが多く、Node.js で扱いやすい。`to-ico` は軽量な ICO 変換パッケージ。

生成スクリプトは `frontend/scripts/generate-icons.mjs` として一度だけ実行し、生成済みバイナリをコミットする（CI での自動再生成はしない）。

### icon-192.png / icon-512.png に分離

manifest.ts で同一 `icon.png` を 2 サイズに見せていたが、実際には 1 枚。2 サイズを明示的に分けることで仕様と実態を一致させる。

## Risks / Trade-offs

- [sharp の SVG 依存] sharp は内部で libvips を使い SVG 処理に `librsvg` が必要。CI / 開発環境で依存が揃っていないと生成失敗する → 生成済みバイナリをリポジトリにコミットすることで回避（CI は生成不要）
- [ICO の単一サイズ] to-ico で 32px のみの ICO を生成する。複数サイズ埋め込みより互換性は低いが、モダンブラウザでは問題なし

## Migration Plan

1. `frontend/scripts/generate-icons.mjs` を実行して PNG / ICO を生成
2. 生成ファイルをコミット
3. `manifest.ts`・`layout.tsx` の参照先を更新してコミット
4. 旧 `icon.png` を削除してコミット
5. Vercel Preview URL で PWA アイコンの表示を確認

ロールバック: 旧 `icon.png` は git 履歴から復元可能。`manifest.ts`・`layout.tsx` を元に戻して旧参照に戻す。
