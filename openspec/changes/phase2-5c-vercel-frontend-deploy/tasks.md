## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Phase 2.5c: Frontend を Vercel にデプロイ"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [x] 1.3 Draft PR を作成する

## 2. Frontend のコード対応

- [x] 2.1 `frontend/src/lib/api.ts` の API URL ベースを `process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"` に切り替える（Phase 1 で既実装済）
- [x] 2.2 `frontend/.env.local.example` を作成（`NEXT_PUBLIC_API_BASE_URL=http://localhost:8080` の例）
- [x] 2.3 `frontend/.gitignore` を確認・調整（`.env*` で全 env を ignore しつつ `!.env.local.example` で example のみ残す）
- [x] 2.4 既存テストが通ることを確認する（`vi.mock("@/lib/api")` 経由なので影響なしのはず）
- [ ] 2.5 ローカル `npm run dev` で動作確認（`.env.local` に `NEXT_PUBLIC_API_BASE_URL=https://<lambda-url>` を設定）

## 3. Vercel プロジェクト作成（ユーザー作業）

- [ ] 3.1 Vercel アカウントを作成する（GitHub OAuth 推奨）
- [ ] 3.2 GitHub リポジトリ `pantry-panel` を Vercel に import する
- [ ] 3.3 プロジェクト設定で Root Directory を `frontend/` に指定する
- [ ] 3.4 Framework Preset が Next.js として認識されていることを確認する
- [ ] 3.5 環境変数 `NEXT_PUBLIC_API_BASE_URL` に Phase 2.5b の Lambda Function URL（例: `https://4xdn54pecs7z4hepmt2xcovq7m0nizno.lambda-url.ap-northeast-1.on.aws`）を Production / Preview / Development の全環境に設定する
- [ ] 3.6 main ブランチを Production Branch として確認する
- [ ] 3.7 初回デプロイを実行 → 完了を確認
- [ ] 3.8 デプロイ完了後の本番 URL（`*.vercel.app`）を控える

## 4. Backend CORS の更新（Lambda 環境変数更新）

- [ ] 4.1 Lambda Function の現在の env を取得 / 確認:
  ```bash
  aws lambda get-function-configuration \
    --function-name pantry-panel-backend \
    --region ap-northeast-1 \
    --query 'Environment.Variables' --output json
  ```
- [ ] 4.2 env JSON ファイルを生成し、`CORS_ALLOWED_ORIGINS` を `http://localhost:3000,https://<vercel-url>` に更新する
- [ ] 4.3 `aws lambda update-function-configuration --environment file://...` で反映
- [ ] 4.4 `LastUpdateStatus=Successful` を確認、curl で CORS ヘッダ確認

## 5. 本番動作確認

- [x] 5.1 ブラウザで `https://<vercel-url>/stock-items` を開く（`/` から redirect される動作も確認）
- [x] 5.2 Network タブで API リクエストが Lambda Function URL に向かっていることを確認する
- [x] 5.3 商品の登録・一覧表示・編集・削除・wantToBuy トグルが動作することを確認する
- [x] 5.4 フィルタ（検索・カテゴリ・買いたいものだけ）が動作することを確認する
- [x] 5.5 表示モード切替（通常 ⇔ シンプル）が動作することを確認する
- [x] 5.6 Supabase SQL Editor で本番データが書き込まれていることを確認する
- [x] 5.7 PWA としてインストール可能か、モバイル / デスクトップで確認

## 6. ドキュメント更新

- [x] 6.1 `README.md` に本番 URL（Frontend / Backend）を記載する
- [x] 6.2 `frontend/.env.local.example` の内容を確認する
- [x] 6.3 `specs/features.md` の Phase 2.5 セクションで 2.5c を完了マーク
- [x] 6.4 `.claude/rules/frontend.md` に Vercel 設定の参照を追記する

## 7. 仕上げ

- [ ] 7.1 CI（lint + tsc + vitest + go test + e2e）がすべてパスすることを確認する
- [ ] 7.2 PR を ready for review にして、Issue を `Closes #N` でリンクする
- [ ] 7.3 マージ後に `openspec archive phase2-5c-vercel-frontend-deploy` で archive する
