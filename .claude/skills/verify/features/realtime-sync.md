# リアルタイム同期

同じグループを 2 つの端末で開いているとき、片方で行った変更（追加・`want to buy` のトグル・削除）が、もう片方に Supabase Realtime 経由で反映される。backend は関与せず、frontend が `stock_items` の行の変更を購読している。

## Sub-features

- `insert` — Context A で追加すると、Context B にカードが出現する
- `update` — Context A で `want to buy` をトグルすると、Context B の `aria-pressed` が変わる
- `delete` — Context A で削除すると、Context B からカードが消える

## How to get to it (user POV)

- 同じアカウント・同じグループで `/stock-items` を 2 つのタブや端末で開き、片方を操作する

## Driving it with Playwright (drive.sh)

```bash
.claude/skills/verify/scripts/drive.sh e2e/realtime-sync.spec.ts
```

- spec は同じ storageState で 2 つの BrowserContext を作り、A で操作して B で待つ
- **証跡.** trace は context ごとに残る

## Gotchas

- Supabase Realtime に実際に接続する（`NEXT_PUBLIC_SUPABASE_*` が必要。launch.sh が `.env.e2e` から設定する）。retry が 3 回設定されており、多少 flaky
- Realtime の WebSocket が繋がる前に操作すると取りこぼす。spec の購読完了待ちを外さない
