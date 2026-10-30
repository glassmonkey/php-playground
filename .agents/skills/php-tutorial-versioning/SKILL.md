---
name: php-tutorial-versioning
description: Adapt PHP tutorial content to a new PHP version or fix compatibility in existing versions; update latest only when requested. Use for curriculum compatibility, not automatic runtime infrastructure changes.
---

# PHPバージョン対応

「新しいPHP版の教材に対応」「旧版の互換性を直す」「検証後にlatestを更新」など、版別の掲載可否と挙動を扱う依頼で使います。

対象版の掲載可否、構文、本文/学習メモ、期待出力と既存版への影響を確認・修正します。教材対応からruntime基盤変更まで自動的に広げません。latest更新は依頼が明示している場合にだけ扱います。

## 進め方

[共通契約](../../tutorial/contract.md)、[版対応](../../tutorial/versioning.md)、[検証](../../tutorial/validation.md) を読みます。学習メモの改訂は [学習意図](../../tutorial/learning-design.md)、checkerの変更は [演習評価](../../tutorial/exercise-evaluation.md) を必要時に読む構成です。

## 成果物と完了条件

成果物は対象版の掲載/互換差分、解決後の本文・コード・メモと版別fixture、既存版への検証結果です。全生成教材の互換性と必要な生成物が確認され、latest変更有無と基盤不足/未確認範囲が報告されたら完了です。

依頼例は [版追加・更新の雛形](prompts/update-version.md) を使います。別用途への切り替えが必要な場合だけ、[入口一覧](../../../doc/tutorial/README.md) から該当スキルを選びます。
