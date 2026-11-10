---
name: verify
description: pantry-panel を実際に起動して、Web UI（Next.js :3000 + Go API :8080 + Supabase）をユーザーと同じ操作で Playwright から動かし、変更が効いたことの証跡（スクリーンショット・trace・ログ）を残す。UI や API の変更後に「本当に動くか」を示すとき、ユニットテストや CI の green だけでは足りないときに使う。
---

# verify — pantry-panel を動かして証明する

主な操作面は Web UI（`/stock-items`）。Go API（`/api/*`）も同時に起動するが、証明は UI 経由のユーザー操作で行う。

全手順は `.claude/skills/verify/scripts/` のスクリプトで行う。リポジトリのルートから実行する。

```bash
.claude/skills/verify/scripts/launch.sh                       # 起動（準備完了まで待つ）
.claude/skills/verify/scripts/doctor.sh                       # 健全性チェック（読み取りのみ）
.claude/skills/verify/scripts/drive.sh stock-crud.spec.ts     # journey を実行して証跡を保存
.claude/skills/verify/scripts/cleanup.sh                      # 自分が起動したものだけ停止
```

## 安全の前提（最初に読む）

- Supabase のプロジェクトは 1 つだけで、**本番と E2E が同じ DB を共有している**。ローカルの `backend/.env.local` や `.envrc` も本番を指している可能性がある。
- そのためスクリプトは `frontend/.env.e2e` **だけ**を読み、`E2E_TEST_GROUP_ID` を必ず空にする。これで `frontend/e2e/global-setup.ts` が **run ごとに使い捨てのグループ**を作り、`global-teardown.ts` はそのグループの item とグループ自体だけを削除する。
- `E2E_TEST_GROUP_ID` を設定して実行しないこと。teardown はアクティブグループの stock item を**全件削除**する。家族のグループ ID が入っていれば実データが消える。
- `backend/` に `cd` して `go run .` しないこと。direnv が `.envrc` を読み込み、接続先が変わる。launch.sh は `go -C backend build` でビルドし、環境変数を明示して起動する。
- env ファイル（`.env.e2e`、`.env.local`、`.envrc`）や `frontend/.auth/user.json` の中身を表示しないこと。有効なセッションや DB パスワードが入っている。

## Launch

`launch.sh` が行うこと:

1. :8080 と :3000 が空いているか確認する。どちらかが使われていれば**起動を拒否する**。Playwright の `reuseExistingServer: true` によって、ユーザー自身の dev server を黙って操作してしまうのを防ぐため。
2. `frontend/.env.e2e` を読み込む。`DATABASE_URL`、`E2E_SUPABASE_URL`、`E2E_SUPABASE_ANON_KEY`、`E2E_TEST_EMAIL`、`E2E_TEST_PASSWORD` がなければ失敗する。`SUPABASE_JWKS_URL` と `NEXT_PUBLIC_*` は `E2E_SUPABASE_*` から補う。`NEXT_PUBLIC_API_BASE_URL` は `http://localhost:8080` に固定する（`frontend/.env.local` が本番 Lambda を指していても上書きされる）。
3. backend をビルドして起動し、`next dev -p 3000` を起動する。それぞれ別のプロセスグループで動かす。
4. 準備完了の判定: backend の `/health` が 200（DB に ping 済み）、かつ backend ログに `JWT authentication enabled` が出ていること。さらに frontend の `/health` が 200 になること（初回はコンパイルで数十秒かかる）。

DB のマイグレーションは Supabase に適用済みなので、launch では実行しない。`compose.yml` のローカル Postgres は使わない（`auth.uid()` や Realtime publication などの Supabase 固有オブジェクトが無く、ログインもできない）。

状態ファイル（pgid、ログ、ビルドしたバイナリ）は `${TMPDIR}/pantry-panel-verify/` に置く。

## Doctor

`doctor.sh` は読み取りのみ。何かおかしいと思ったら最初に実行する。確認すること:

- `frontend/.env.e2e` がある
- :8080 と :3000 の listener が、launch.sh が記録したプロセスグループに属している（他人のサーバーではない）
- backend の `/health` が 200、JWT 認証が有効
- frontend の `/health` が 200

`doctor: healthy` 以外なら `cleanup.sh` を実行してから `launch.sh` をやり直す。drive.sh も実行前に doctor を通す。

## Drive

Playwright の `mock` project を使う（storageState、reducedMotion、Service Worker 無効は `frontend/playwright.config.ts` の設定を引き継ぐ）。認証は `global-setup.ts` がテストユーザーで password ログインして cookie を作る。Google OAuth の画面は通らない。

```bash
# スキル付属の journey（.claude/skills/verify/journeys/ 配下）
.claude/skills/verify/scripts/drive.sh stock-crud.spec.ts
# 既存の E2E spec（frontend/ からの相対パス）
.claude/skills/verify/scripts/drive.sh e2e/filter.spec.ts
```

付属の journey は実行時に `frontend/e2e/verify-scratch/` にコピーされる（`@playwright/test` を `frontend/node_modules` から解決するため）。実行後は削除される。このディレクトリは gitignore 済み。

変更を検証する新しい journey を書くときは、`journeys/` に `*.spec.ts` を追加する。セレクタは安定したハンドルを使う。座標やタブ順には頼らない。

- ボタン: `getByRole("button", { name: "商品を追加" })`、`"追加"`（`exact: true`）、`"保存"`、`"削除"`、`"確認"`
- ダイアログ: `getByRole("dialog")`。入力欄は `getByLabel("名前")`、`getByLabel("カテゴリ", { exact: true })`
- 商品カード: `getByRole("article", { name: <商品名> })`
- 機能ごとのセレクタと到達経路は `features/` を参照する

各 run は使い捨てグループで始まる（item 0 件）。前提データは journey の中で UI から作る。

## Evidence

証跡は `.verify-evidence/<run-id>/` に残る（gitignore 済み）。cleanup では消えない。

- `screenshots/*.png` — journey 内の `shot(page, name, settle?)` で撮影したもの。`settle` に Locator を渡すと、その要素と祖先がすべて opacity 1 になるまで待ってから撮る（motion のフェードは JS 駆動なので `getAnimations()` では待てない）
- `test-results/**/trace.zip` — 全操作の trace。`npx playwright show-trace <path>` で開く。**network に Bearer トークンが含まれるので共有・コミットしない**
- `report/` — HTML レポート
- `playwright.log`、`backend.log`、`frontend.log`

証明の基準:

- 実際のユーザー経路（UI の操作）で行う。内部の setter、テスト専用エンドポイント、API の直接呼び出しで代用しない
- 操作した瞬間だけでなく、その後の状態も示す。**リロード後も残っている／消えている**ことで、Go API と DB への書き込み（副作用）を確認する
- モックは、本番でも外部システムとの境界になっている箇所に限る。この repo の該当箇所は `frontend/e2e/fixtures/mock-routes.ts` の `/api/image-search` と `/api/extract-from-url`（Google CSE と商品ページの取得）だけ
- 失敗したら、失敗した run の証跡をそのまま報告する。journey を弱めて通さない

## Cleanup

`cleanup.sh` は launch.sh が記録したプロセスグループだけを停止する。プロセス名で kill しない。状態ディレクトリと `frontend/e2e/verify-scratch/` を消し、`next dev` が書き換えた `frontend/AGENTS.md` を launch 時の内容に戻す。`.verify-evidence/` には触れない。失敗した試行の後にも必ず実行する。

ポートに他人の listener が残っていた場合は、報告だけして止めない。

## Gotchas

- **backend を止め忘れると、Supabase の pooler のセッションを占有し続ける**。CI の e2e が `EMAXCONNSESSION` で落ちる原因になるので、作業の終わりには必ず cleanup する。
- `npm install` や Renovate で Playwright が更新されると、ブラウザが無いと言われて失敗する（`Executable doesn't exist ... chrome-headless-shell`）。`cd frontend && ./node_modules/.bin/playwright install chromium` を実行する。
- 2 つ目のインスタンスを並べて動かすことはできない。ポート（storageState の cookie ドメイン、CORS の既定値 `http://localhost:3000`）が固定されているため。ユーザーの dev server が動いているときは、止めてもらうか、そのまま待つ。
- Realtime の検証（`e2e/realtime-sync.spec.ts`）は Supabase Realtime に実際に接続する。retry が設定されており、多少 flaky。
- `frontend/.auth/` は global-setup が上書きし、teardown が削除する。

## 保守

機能が増えたり UI が変わったりしたら `/maintain-verification-skill` で `features/` を更新する。
