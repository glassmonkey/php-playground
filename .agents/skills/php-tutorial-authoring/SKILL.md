---
name: php-tutorial-authoring
description: Add or revise PHP tutorial lessons within the existing chapter design, including examples, experiments, learning notes and fixtures. Use for lesson writing, not curriculum redesign or read-only review.
---

# 教材の追加・改訂

「既存の変数の章へLessonを追加」「Experimentの説明と学習メモを直す」など、既存章の基準に沿う執筆で使います。

本文、Example/Experiment、学習メモ、参照先と必要なfixtureを追加・改訂します。既存章へのLesson追加はこのスキルで完結します。章境界/学習順の変更が必要なら、必要性と影響を整理してカリキュラム設計へ返します。

## 進め方

[共通契約](../../tutorial/contract.md) を読み、[教材追加・改訂](../../tutorial/lesson-authoring.md) に沿って進めます。学習情報は [学習意図](../../tutorial/learning-design.md)、チェックと生成物は [検証](../../tutorial/validation.md) を使います。checkerの変更や互換対応などの条件付き詳細は、各文書の該当リンクから必要時だけ読みます。

## 成果物と完了条件

成果物は対象Lesson/Program/学習メモと、必要な版別fixtureの差分です。既存章の境界と前提に収まり、対象版の構造・WASM・意味・生成物の確認が揃ったら完了です。対象版/slug、一次資料、実行結果と未確認範囲を報告します。

依頼例は [教材追加の雛形](prompts/add-lesson.md) を使います。別用途への切り替えが必要な場合だけ、[入口一覧](../../../doc/tutorial/README.md) から該当スキルを選びます。
