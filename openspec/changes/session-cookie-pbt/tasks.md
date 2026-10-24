## 1. 導入

- [ ] 1.1 `frontend` に `fast-check@4.10.2` を devDependencies として追加する（`npm i -D`、package-lock も更新）。`node_modules/fast-check` が存在し、`npm test` が既存のまま通ることで確認する

## 2. 往復のプロパティ

- [ ] 2.1 `frontend/src/lib/sessionCookie.property.test.ts` を作り、project ref・JWT 形式の `access_token`・Unicode を含む `user_metadata`・長さ指定のパディングの生成器を定義する。chunk が 1 個のケースと複数個のケースの両方が生成されることを `fc.statistics` などで確認する
- [ ] 2.2 往復: `buildSessionCookies` で作った cookie を `readAccessTokenFromCookies` で読むと元の `access_token` に戻る、を `fc.asyncProperty` で検証する（`await fc.assert`）。テストが通ることで確認する
- [ ] 2.3 分割境界: `MAX_CHUNK_SIZE` の倍数 ±数文字の長さの cookie 値でも往復が成り立つことを検証する。テストが通ることで確認する
- [ ] 2.4 旧形式: `base64-` 接頭辞なしの生 JSON の cookie から `access_token` を読めることを検証する。テストが通ることで確認する

## 3. 混入と壊れた入力のプロパティ

- [ ] 3.1 混入: 無関係な cookie・別の project ref の cookie を混ぜても結果が変わらないこと、分割されていない cookie と `.N` が同時にあるときは分割されていない方が使われることを検証する。テストが通ることで確認する
- [ ] 3.2 古い chunk・欠け: 末尾に古い `.N` が残る、途中の chunk が欠ける場合に、正しいトークンか `null` のどちらかを返し、例外を投げないことを検証する。テストが通ることで確認する
- [ ] 3.3 壊れた入力: 任意の文字列の cookie 値、base64 / JSON として不正な値、`access_token` が文字列以外（数値・null・オブジェクト・欠落）のとき、`null` を返し例外を投げないことを検証する。テストが通ることで確認する

## 4. 検証

- [ ] 4.1 実装を一時的に壊して（`base64-` を除去しない、結合後の文字列を切り詰める）、2.x / 3.x のプロパティが失敗することを確認し、元に戻す（変更はコミットしない）。PR に確認結果を記載する
- [ ] 4.2 `npx biome check`・`npx tsc --noEmit`・`npm test` がローカルで通り、push 後に `gh pr checks --watch` で CI が通ることを確認する
