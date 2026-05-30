## Context

`UrlRegistrationModal` は手動でURLを入力・ペーストして抽出を開始するフローだった。ユーザーは別アプリでURLをコピーした後、モーダルを開いてペーストするという2ステップが必要だった。

Clipboard API (`navigator.clipboard.readText()`) はユーザージェスチャー起点（ボタンクリック）であれば呼び出せるため、モーダルopen時に自動読み取りして1操作に短縮できる。

プラットフォーム差異：
- PC (Chrome/Edge/Firefox): 初回のみ権限ダイアログ、以降サイレント
- macOS Safari: ユーザージェスチャーがあれば権限ダイアログなし
- Android Chrome: PCと同様
- iOS Safari / iOS PWA: 毎回OSシステムダイアログ（"Paste"ボタン）が表示される仕様で回避不可

## Goals / Non-Goals

**Goals:**
- モーダルopen時にクリップボードを自動読み取りし、有効なURLであれば自動入力 + 自動submit
- 非URLまたは読み取り失敗時はモーダルを開きつつ通知を表示
- `navigator.clipboard` 非対応環境（HTTP、古いブラウザ）ではフォールバックして従来通り動作

**Non-Goals:**
- クリップボード権限の事前チェック・ポーリング
- iOS のシステムダイアログを回避する手段の実装（OS仕様のため不可能）
- バックエンドの変更

## Decisions

### D1: クリップボード読み取りタイミング

**決定**: `useEffect` の `isOpen` 依存で、open時（`isOpen === true`）に `navigator.clipboard.readText()` を呼ぶ。

**理由**: モーダルを開くボタンクリックがユーザージェスチャーとなり、ブラウザの権限要件を満たす。読み取り後に自動submitする場合も、最初のopen直後にstreamingが始まるため自然なUXになる。

**代替案**: 呼び出し元（`StockItemsClient`）でボタンクリック時に読み取る → モーダルに `initialUrl` propで渡す。こちらはモーダルの責任分離が明確だが、クリップボード読み取りの副作用をモーダル外に持たせると再利用性が下がるため却下。

### D2: `submit` 関数のuseEffect依存回避

**決定**: `submitRef = useRef(submit)` パターンを使い、useEffectの依存配列を `[isOpen]` のみにする。

**理由**: `submit` を `useCallback` にすると `onExtracted/accessToken/activeGroupId` が deps に入り、これらの変更のたびに「モーダルが開いていなくても」useEffectが再実行される恐れがある。refパターンなら `submit` は常に最新を参照しつつ、effectは `isOpen` 変化時のみ発火する。

### D3: 自動submitタイミング

**決定**: URL検証後、`setUrl(trimmed)` → `submitRef.current(trimmed)` の順に同期的に呼ぶ。

**理由**: `url` stateにURLを設定してからsubmitすることで、streamingフェーズ中もdisabledなinputにURLが表示されてユーザーが何を処理中か分かる。

### D4: URL有効性チェック

**決定**: `new URL(text)` でパースし、protocol が `http:` または `https:` であれば有効とみなす。

**理由**: ブラウザネイティブのURLパーサーを使うため追加ライブラリ不要。`javascript:` や `ftp:` など意図しないプロトコルを除外できる。

## Risks / Trade-offs

- **iOS毎回ダイアログ**: `navigator.clipboard.readText()` 呼び出し時にOSシステムダイアログが毎回表示される → ユーザーへの説明（本proposalのスコープ外）で対処。軽減はできない
- **権限拒否後の通知**: ユーザーが権限を拒否すると `catch` に入り「URLの読み取りに失敗しました」が表示されるが、「権限を拒否しました」との区別がない → 現状は単一メッセージで許容
- **非HTTPS環境**: `navigator.clipboard` はHTTPSまたはlocalhostのみ利用可能。HTTP環境では `undefined` になるため、`if (!navigator?.clipboard?.readText)` で早期リターンしてフォールバックする
