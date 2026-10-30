# PHPチュートリアルの共通契約

この文書は4つの制作スキルから直接参照する共通ルールの正本です。各タスクで必要な詳細だけを読み、他用途のSKILL.mdを共通知識の入口にしません。各スキルの実行範囲・read-only指定を、共有手順中の修正例より優先します。

## 正本と実行環境

- schemaとProgram契約は `src/tutorial/types.ts`、構造検証は `validate-content.ts`、版別教材は `content.ts` の `lessonsByVersion`、著者用学習メモは `learning-notes.ts`。
- 学習章の順序と境界は `chapters.ts`、仕様分類は `reference-chapters.ts`。表示順は `groupLessons` で解決する。両分類の対応は [仕様参照](language-reference-map.md) を必要時に読む。
- 対応版と明示的なlatest選択は `config.ts` の `tutorialVersions` / `latestTutorialVersion` と参照元のruntime一覧。schema、現行の章・slug・版一覧・版数・latest値を文書へ複製しない。
- PHP/WASMをブラウザー内で実行する教材。HTTP server、DB、Composer、framework運用/security等の環境は未提供であり、その支援やcoverageを暗示しない。環境追加は教材追加から自動的に広げず、依頼範囲で別途設計する。

## 教材の不変条件

画面に出す教材は英語。既存のsections/blocksによる提示構造と共有programsを使い、LessonごとのJSX分岐やコード・期待出力の別コピーを作らない。学習目標、変更点・観察点・理由、典型的誤解は [学習意図](learning-design.md) に従って確認する。理由は著者/評価用であり、追加するだけでUIに解答表示を増やさない。

ExampleとExperimentは兄弟。選択ではコード/input/draftを切り替えて出力を消し、実行はRun操作後だけ。出力は一つのlabに表示し、本文に固定出力を手書きしない。Program.inputはコードが `$input` を読むときだけ設定する。採点はauthor-only harnessで確認し、学習者向けのCheck操作を増やさない。

PHP仕様・導入版は公式PHP Manual/release notesを一次資料とし、Lessonのreferencesに主張を直接支えるリンクを記録する。リンクの存在や章の分類だけで内容の一致を判定しない。版解決後の本文・Example/Experiment・goal・学習メモ・参照先を一組として見る。

書籍の目次は話題・前提順の検討材料にとどめ、章立て・順序・見出し・本文・例を転用しない。出版社公式の[『独習PHP 第4版』目次](https://www.shoeisha.co.jp/book/detail/9784798168494)を参考にする場合も、学習順を独自に設計する。

## 検証と公開物

構造・参照、実WASM動作、意味・教育のレビューを分ける。必要な実行コマンド、fixtureの限界、SEO/OGP確認は [検証と生成物](validation.md) を読む。コードが動くことやメモが埋まっていることだけで意味の正しさを保証しない。

既存固定版URLは維持する。latestを変更できるのは明示依頼があり、対象教材の検証後だけ。教材対応を依頼されたことからruntime基盤の変更を自動的に含めない。版を扱う具体的な手順は [版対応](versioning.md) に集約する。
