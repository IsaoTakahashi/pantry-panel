## 1. UrlRegistrationModal — クリップボード読み取りロジック

- [ ] 1.1 `isValidUrl(text: string): boolean` ヘルパー関数をコンポーネント外に追加する（`new URL()` + protocol チェック）
- [ ] 1.2 `ClipboardNotice` 型を定義する（`{ type: "notUrl"; text: string } | { type: "failed" }`）
- [ ] 1.3 `clipboardNotice` state を `useState<ClipboardNotice | null>(null)` で追加する
- [ ] 1.4 `submitRef = useRef(submit)` パターンを実装し、毎render後に `submitRef.current = submit` を更新するeffectを追加する
- [ ] 1.5 既存の `useEffect([isOpen])` に clipboard 読み取りロジックを追加する
  - `navigator?.clipboard?.readText` が存在しない場合は早期リターン
  - 読み取り成功 + 有効URL → `setUrl(trimmed)` → `submitRef.current(trimmed)`
  - 読み取り成功 + 非URL → `setClipboardNotice({ type: "notUrl", text: trimmed })`
  - 読み取り失敗（catch）→ `setClipboardNotice({ type: "failed" })`
  - 空文字列 → 何もしない
- [ ] 1.6 `submit` 関数の冒頭で `setClipboardNotice(null)` を呼び、通知をクリアする
- [ ] 1.7 URL input の `onChange` ハンドラで `clipboardNotice` をクリアする（ユーザーが入力を始めたとき）

## 2. UrlRegistrationModal — 通知UI

- [ ] 2.1 `clipboardNotice` が存在するとき、フォーム内（URL input の下）に通知ブロックを表示するJSXを追加する
  - "URLの読み取りに失敗しました" のメッセージを表示
  - `type === "notUrl"` のとき、読み取れた文字列（60文字超は末尾に…を付けてトリム）を表示
  - スタイル: amber系の警告ボックス（`bg-amber-50 border-amber-200 text-amber-700`）

## 3. テスト — UrlRegistrationModal.test.tsx

- [ ] 3.1 `navigator.clipboard.readText` のモック設定を `beforeEach` / `vi.fn()` で用意する
- [ ] 3.2 **シナリオ: 有効URL → 自動submit開始** のテストを追加する
  - クリップボードに `https://example.com/product` をセット
  - モーダルを open
  - `extractFromUrlStream` が呼ばれること（自動submit）を検証
- [ ] 3.3 **シナリオ: 非URLテキスト → 通知表示** のテストを追加する
  - クリップボードに `"何かのテキスト"` をセット
  - モーダルを open
  - "URLの読み取りに失敗しました" が表示されること
  - 読み取れた文字列が表示されること
- [ ] 3.4 **シナリオ: 60文字超の非URLテキスト → 60文字＋省略記号** のテストを追加する
- [ ] 3.5 **シナリオ: clipboard 読み取り失敗 → エラー通知のみ** のテストを追加する
  - `readText` が reject する状況をモック
  - "URLの読み取りに失敗しました" が表示され、clipboard テキストが表示されないことを検証
- [ ] 3.6 **シナリオ: クリップボードが空 → 通知なし** のテストを追加する
- [ ] 3.7 **シナリオ: navigator.clipboard が undefined → 通知なし・通常open** のテストを追加する
- [ ] 3.8 **シナリオ: 通知表示後にユーザーが入力すると通知消去** のテストを追加する
- [ ] 3.9 既存テストが全て pass することを確認する（`npm test` or `npx vitest run`）

## 4. E2Eテスト — url-registration.spec.ts

- [ ] 4.1 **シナリオ: クリップボードに有効URLを設定してリンクボタンをクリック → 自動submit** のE2E Mockテストを追加する
  - `page.context().grantPermissions(["clipboard-read", "clipboard-write"])` でクリップボード権限を付与
  - `page.evaluate(() => navigator.clipboard.writeText("https://..."))` でURLをセット
  - リンクボタンをクリック
  - streamingステップの表示を確認（自動submitが走ったことを示す）
- [ ] 4.2 既存E2Eテストが全て pass することを確認する（`npx playwright test`、dev server 起動済み）
- [ ] 4.3 E2Eテスト修正が必要な場合は `not.toBeAttached()` パターンで対応する（モーダルのexit animation対策）
