# 動的演習の評価と誤判定の検証

演習評価のコード契約は `src/tutorial/types.ts`、`src/tutorial/content.ts` と、実際に実行する `src/tutorial` の評価処理が正本です。以下は問題設計と検証方法であり、別のスキーマを追加するものではありません。コードの現在の型・実行経路が以下の記述と異なる場合は、コードを優先して内容を更新します。

演習 solution は program registry の `solutionProgramId` で参照し、checker が対象にする正解 program と同じ code を使います。checker 用に別の解答文字列を複製しません。learner flow は Example / Experiment の手動実行で、採点結果は author-only harness から確認します。

## ケースの設計

入力に応じて動作する関数や変換処理を教える演習では、異なる JSON 入力を複数用意し、ハードコードした答えを見破れるようにします。固定の出力を学ぶような入力非依存の課題では、無理に意味のないケースを増やしません。ケース数に関わらず、各ケースには学習者に分かる短いラベルを付け、入力と判定意図を対応させます。

- ふつうの入力と少なくとも一つ異なる値を使い、値をハードコードした解答を見破れるようにする。
- 学習目的に関係する境界値や空値を含める。未習の制約や未定義の挙動を採点要件にしない。
- 入力が制約外のときの動作を教える場合に限り、その不正入力ケースを加える。
- 各ケースが独立した入力で動き、実行状態や前ケースの変数に依存しないことを確認する。

`checkPhp` はチェッカーを含む完全な PHP ファイルとして扱い、契約で定めた `$input`、文字列 `$output`、`$returnValue` を使って結果配列を返します。ケースは学習者の PHP とチェッカーを同じ対象-version WASM request 内で実行します。各ケースの request は独立するので、チェッカーは前ケースから状態を引き継げません。Checker code は各 Lesson が有効な全 target PHP runtimes で parse / execute できなければなりません。例えば `mixed` type は PHP 8.0 より前では使えません。古い版も対象なら互換 syntax を使うか、版ごとの checker/program metadata を用意します。引数名・型、戻り値の形は型と実行コードを確認し、ここにコピーした契約を拡張しないでください。

判定は、演習が教える観察可能な振る舞いを検証します。出力が対象なら完全な出力と改行を比べ、関数の戻り値が対象なら戻り値も照合します。クラス設計などの課題で、実行結果だけでは要求を区別できない場合は、課題の実装条件を再検討するか、明示的な観察方法を用意します。提示解答の文字列一致や、特定の変数名・コード片の探索を正解判定の代用にしません。

## WASM での検証

対象版の実際の PHP WASM worker で、各ケースについて学習者の例と checker を一緒に動かします。checker も PHP ファイルなので、checker 自体を対象 PHP 版で実行します。`src/tutorial/config.ts` の `tutorialVersions` と `src/tutorial/content.ts` の `lessonsByVersion` から検証対象を求め、各掲載版の Lesson solution/checker を実行し、構文、JSON decode、型、例外の扱いを確認します。版を追加した際は、新版も検証対象に含まれていることを確認します。

アプリの学習者向け画面はコード編集と手動実行に絞り、ケースの pass / fail 結果は表示しません。採点ロジックは `src/tutorial/authoring/assessment-harness.html` から実際の `src/tutorial/assessment-worker.ts` を使って確認し、`e2e/tutorial-runtime.spec.ts` が harness を実行します。harness は学習者向け route ではありません。

すべての Lesson solution と全 case を config の全対象 PHP version で実行するときは次を実行します。

```sh
npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'runs every registered lesson solution'
```

negative controls、構文・終了・空出力、worker stop / harness timeout 後の復旧を確認するときは次を実行します。

```sh
npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'detects hard-coded|negative control|PHP errors|stop or time out'
```

全 E2E と runtime authoring checks は既存の Playwright 設定で次の一つの suite として実行できます。

```sh
npm run test:e2e
```

Runtime checks share the existing Playwright configuration and Vite server with the public app tests; there is no separate authoring server or package script. The harness stop/timeout cases terminate the test worker and do not verify a production UI timeout contract. Learner navigation and editing are covered by `npm run test:e2e -- e2e/tutorial.spec.ts`; runtime programs/checkers use `npm run test:e2e -- e2e/tutorial-runtime.spec.ts`. To run both UI and runtime checks together, use `npm run test:e2e`. CLI baseline parity can be focused with `npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'registered Experiment Program against CLI/WASM output baselines'`. A baseline is the same registry code run in another runtime, not an independently defined semantic expected result.

## 誤判定を見つける negative controls

模範解答が pass する確認だけでは、checker が正しさを区別できると分かりません。採点対象の要件を一つずつ壊した意図的な誤答も作り、すべてのケースを対象版 WASM で実行します。

例:

- 正解の出力に余分な文字を加えたコードが、部分文字列一致で誤って pass しない。
- 一つの入力だけをハードコードしたコードが、異なる入力でも pass しない。
- 境界ケースで off-by-one を起こすコードが pass しない。
- 表示は同じでも、戻り値が採点対象の課題で間違った戻り値を返すコードが pass しない。
- 失敗すべきケースが一つだけあるコードで、別ケースの結果が同じ共有状態のために pass へ変わらない。

負の対照が、違反した要件に対応するケースを pass したら、checker はその誤りを検出できていません。たとえば固定の名前を返す誤答は、その名前と一致するケースでは pass してもよいですが、異なる名前のケースも pass してはいけません。checker または課題文を直し、正解例がすべてのケースで pass し、誤答が該当するケースで fail するまで同じランタイムで再確認します。網羅できない挙動は、確認済みのように報告せず未確認として記します。
