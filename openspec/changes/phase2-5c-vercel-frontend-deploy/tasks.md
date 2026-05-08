## 1. Issue・ブランチ準備

- [ ] 1.1 GitHub Issue を作成する（タイトル: "Phase 2.5c: Frontend を Vercel にデプロイ"）
- [ ] 1.2 Issue 番号ベースのブランチを作成する
- [ ] 1.3 Draft PR を作成する

## 2. Frontend のコード対応

- [ ] 2.1 `frontend/src/lib/api.ts` を読み、API URL のベース部分を `process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"` に切り替える
- [ ] 2.2 `frontend/.env.local.example` を作成（`NEXT_PUBLIC_API_BASE_URL=http://localhost:8080` の例）
- [ ] 2.3 `frontend/.gitignore` に `.env*.local` が含まれていることを確認する
- [ ] 2.4 既存テストが通ることを確認する（`vi.mock("@/lib/api")` 経由なので影響なしのはず）
- [ ] 2.5 ローカル `npm run dev` で動作確認（`.env.local` に `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080` を設定）

## 3. Vercel プロジェクト作成（ユーザー作業）

- [ ] 3.1 Vercel アカウントを作成する（GitHub OAuth 推奨）
- [ ] 3.2 GitHub リポジトリ `pantry-panel` を Vercel に import する
- [ ] 3.3 プロジェクト設定で Root Directory を `frontend/` に指定する
- [ ] 3.4 Framework Preset が Next.js として認識されていることを確認する
- [ ] 3.5 環境変数 `NEXT_PUBLIC_API_BASE_URL` に Phase 2.5b の App Runner URL（例: `https://xxxxx.ap-northeast-1.awsapprunner.com`）を Production / Preview / Development の全環境に設定する
- [ ] 3.6 main ブランチを Production Branch として確認する
- [ ] 3.7 初回デプロイを実行 → 完了を確認
- [ ] 3.8 デプロイ完了後の本番 URL（`*.vercel.app`）を控える

## 4. Backend CORS の更新（App Runner 環境変数更新）

- [ ] 4.1 App Runner コンソールで `pantry-panel-backend` サービスを開く
- [ ] 4.2 環境変数 `CORS_ALLOWED_ORIGINS` を `http://localhost:3000,https://<vercel-url>` に更新する
- [ ] 4.3 設定保存 → App Runner が自動再デプロイされる（数分待つ）
- [ ] 4.4 再デプロイ完了を確認

## 5. 本番動作確認

- [ ] 5.1 ブラウザで `https://<vercel-url>/stock-items` を開く
- [ ] 5.2 Network タブで API リクエストが App Runner URL に向かっていることを確認する
- [ ] 5.3 商品の登録・一覧表示・編集・削除・wantToBuy トグルが動作することを確認する
- [ ] 5.4 フィルタ（検索・カテゴリ・買いたいものだけ）が動作することを確認する
- [ ] 5.5 表示モード切替（通常 ⇔ シンプル）が動作することを確認する
- [ ] 5.6 Supabase SQL Editor で本番データが書き込まれていることを確認する

## 6. ドキュメント更新

- [ ] 6.1 `README.md` に本番 URL（Frontend / Backend）を記載する
- [ ] 6.2 `frontend/.env.local.example` の内容を確認する
- [ ] 6.3 `specs/features.md` の Phase 2.5 セクションを更新する
- [ ] 6.4 `.claude/rules/frontend.md` に Vercel 設定の参照を追記する

## 7. 仕上げ

- [ ] 7.1 CI（lint + tsc + vitest + go test）がすべてパスすることを確認する
- [ ] 7.2 PR を ready for review にして、Issue を `Closes #N` でリンクする
- [ ] 7.3 マージ後に `openspec archive phase2-5c-vercel-frontend-deploy` で archive する
