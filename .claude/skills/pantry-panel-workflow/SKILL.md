---
name: pantry-panel-workflow
description: pantry-panel における機能追加・修正依頼を受けたときに、brainstorming から opsx:propose・opsx:apply・opsx:archive までの設計・変更管理ワークフロー全体と、各フェーズでの test-design / implementation / diff-review agent への委譲先を発火させる。ユーザーが新機能の追加や既存機能の修正を依頼してきたときに使う。
---

## このSkillの位置づけ（4層構造）

pantry-panelの開発ワークフローは4層に分かれている。混同しないこと。

1. **`.claude/rules/general.md`**（常時ロードされるルール）— 「設計・変更管理ワークフロー」表・「開発フロー」表として、各フェーズで何をすべきかを定義する規範
2. **このSkill（`pantry-panel-workflow`）**（発火トリガー）— 上記1の内容を、descriptionによる発火が効く「呼び出し可能な実行ガイド」に変換したもの
3. **`.claude/agents/test-design.md` / `implementation.md` / `diff-review.md`**（委譲先の実体）— 各フェーズで実際にdelegateされるproject-scoped agent
4. **superpowersスキル**（`test-driven-development` / `subagent-driven-development` / `requesting-code-review` 等）（実行手順）— TDDやレビューの一般的な作法。agentはこれらを呼び出すだけで、手順自体は再実装しない

**同期の注意**: このSkillの内容は `.claude/rules/general.md` の「設計・変更管理ワークフロー」表と重複している。どちらか一方を更新したときは、もう片方も同じ内容になるよう同期すること。

## ワークフロー全体の流れ

```
superpowers:brainstorming
        │（要件が曖昧・UIの視覚比較が必要なときのみ。設計が明確なら省略可）
        ▼
opsx:propose  ── 完了後すぐに GitHub Issue + Draft PR を作成する
        │
        ▼
[test-design agent] ── proposal.md の「ユーザーシナリオとテスト設計」セクションを作成 → ユーザーレビュー
        │
        ▼
opsx:apply + [implementation agent]（superpowers:subagent-driven-development 経由で派遣）
        │   各 implementation agent は superpowers:test-driven-development で TDD を実施
        │   commit のたびに push し、PR 上の CI を最新状態に保つ
        ▼
ローカルE2E確認 ── 全タスク完了後・push前に `cd frontend && npx playwright test`
        │   UIコンポーネント（モーダル・アニメーション）変更時は必須。dev server 起動が前提
        ▼
[diff-review agent] ── 変更差分をレビュー → ユーザーが最終確認
        │
        ▼
CI 確認 ── `gh pr checks --watch` で PR 上の CI 結果を確認。失敗があれば調査・修正
        │
        ▼
opsx:archive ── PR マージ前に実施。specs 同期・アーカイブコミットも同じ feature ブランチに含める
        │   (1) proposal.md のユーザーシナリオを関連 spec.md へ昇格
        │   (2) レビューで確定した判断基準を specs/testing-decision-log.md の更新ログに追記
        ▼
      PR マージ
```

## 各ステップの委譲先

| フェーズ | 委譲先 | 補足 |
|---------|--------|------|
| 設計・探索 | `superpowers:brainstorming` | 要件が曖昧・UIの視覚比較が必要なときのみ |
| 変更登録・タスク化 | `opsx:propose` | 完了後すぐに GitHub Issue + Draft PR を作成する |
| テスト設計 | **`test-design` agent** | `.claude/rules/testing.md` のハイブリッドフォーマットに従う |
| 実装 | `opsx:apply` → **`implementation` agent**（`superpowers:subagent-driven-development` で派遣） | 各agentは `superpowers:test-driven-development` に従う |
| ローカルE2E確認 | （agentなし） | `cd frontend && npx playwright test` |
| コードレビュー | **`diff-review` agent** | `superpowers:requesting-code-review` を呼び出す |
| CI 確認 | （agentなし） | `gh pr checks --watch` |
| 完了処理 | `opsx:archive` | PR マージ前。specs 昇格・判断基準ログ追記を含む |

## 前提となるGit運用

- すべての変更はブランチを切り、PR経由でmainにマージする（mainへの直接push禁止）
- ブランチ名は `{issue番号}-{概要}`
- PR本文に `Closes #N` を付ける

## 直接の修正依頼（opsxフロー外）の扱い

ユーザーから「〜を直してください」のような直接の修正依頼が来た場合も、原則としてsub-agentを使う。変更が小さいと判断した場合でも、勝手にsub-agentを省略せず、必ずユーザーに確認してから決める（確認なしに省略できる下限はない）。
