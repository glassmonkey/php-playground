---
name: php-tutorial-review
description: Review PHP tutorial PRs, content and reference consistency read-only; report evidence-based findings about goals, prerequisites, versions, sources and runtime verification. Do not implement fixes implicitly.
---

# 教材の読み取り専用レビュー

「この教材PRをレビュー」「説明と参照先が合うか確認」など、根拠付きのFBが必要な依頼で使います。

教材・コード・参照・検証証拠を読み取り専用で確認し、指摘と改善案を返します。教材/fixture/設定の編集、解答の書き換え、commit/pushは始めません。実装依頼へ明示的に役割が変わる場合は、対応する制作タスクとして範囲を確認します。

## 進め方

[共通契約](../../tutorial/contract.md) と [レビュー観点](../../tutorial/review.md) を読みます。対象差分に応じてそこから必要な参照だけを追加し、執筆・版追加・章設計の全SKILL.mdを読み込ませません。

## 成果物と完了条件

成果物は重要度・対象箇所/版・根拠・影響・推奨修正を含むレビュー報告です。未確認候補と確定指摘を分け、確認範囲と未実施を明記したら完了です。具体的指摘がなければその旨を報告し、修正実装を完了条件にしません。スキル生成性能の評価は別タスクです。

依頼例は [レビューの雛形](prompts/review.md) を使います。別用途への切り替えが必要な場合だけ、[入口一覧](../../../doc/tutorial/README.md) から該当スキルを選びます。
