# pantry-panel verification map

このディレクトリは、pantry-panel のユーザー向け機能を検証するときの手順の元になる資料で、継続して更新する。アプリを動かす前にこの索引を読み、該当する機能ファイルの手順に従う。

| 機能 | ファイル | 駆動手段 | 証明済み |
|------|---------|---------|---------|
| 在庫アイテムの登録・編集・削除 | [stock-crud.md](stock-crud.md) | `journeys/stock-crud.spec.ts` | 2026-11-10 |
| フィルタ（検索・カテゴリ・買いたいもの） | [filter.md](filter.md) | `e2e/filter.spec.ts` | 未 |
| URL から商品登録 | [url-registration.md](url-registration.md) | `e2e/url-registration.spec.ts` | 未 |
| 商品画像の設定 | [image-selection.md](image-selection.md) | `e2e/image-selection.spec.ts` | 未 |
| リアルタイム同期 | [realtime-sync.md](realtime-sync.md) | `e2e/realtime-sync.spec.ts` | 未 |

マップにまだ無い機能: グループ管理・招待（`/invite`、`/join`、ヘッダーのグループ切替）、シンプルビュー（`通常` / `シンプル` の切替）、ログイン・ログアウト（`e2e/auth.spec.ts` が一部を扱う）。

## 前提（全 journey 共通）

- `scripts/launch.sh` で起動し、`scripts/doctor.sh` が `healthy` を返すこと。自分が起動していないインスタンスは操作しない
- 各 `drive.sh` の実行は、新しく作られる使い捨てグループ（名前は `e2e-local-<timestamp>-1`、item 0 件）で始まる。前提データは journey の中で UI から作る
- 商品名には `Date.now()` を付けて一意にする

## 操作の約束事

- ARIA の role とアクセシブルネームを使う。CSS セレクタや DOM 上の位置に頼らない
- 商品カードは `getByRole("article", { name: <商品名> })` で取り、その中のボタンを辿る
- ダイアログはアニメーションで閉じる。次の操作の前に `expect(page.getByRole("dialog")).not.toBeAttached()` を待つ

## 証明とスキップの報告

- 操作と、その結果の状態の両方を記録する。**リロード後の状態**で、DB への書き込みを確認する
- 証跡は `.verify-evidence/<run-id>/` に残る。報告には run-id と使った入口（どのボタンや経路から操作したか）を書く
- 到達できなかった入口は、試したコマンドと満たせなかった前提を書いて報告する。別の入口で通ったことを、その入口の検証済みとして報告しない
