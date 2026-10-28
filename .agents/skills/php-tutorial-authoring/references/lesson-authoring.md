# 構造化レッスンと一次資料

## 仕様の根拠

PHP の言語仕様や版差を説明するときは、公式 PHP マニュアルを第一の参照先とし、必要なら php.net の公式リリース情報も使います。レッスンの `references` には、説明を直接裏付けるページを記録します。二次解説だけで仕様を断定せず、公式資料の記述が曖昧な場合はその範囲を明示します。

公式文書で対象版がその機能を持つと分かることと、このアプリの同じ版の WASM runtime が実行できることは別々に確認します。共有データを複数版で使うなら、含める各版の Playground で実行します。

## データを作り、registry と renderer で検証する

Lesson、Program、Experiment、section、block の型は `src/tutorial/types.ts`、validator は `src/tutorial/validate-content.ts` を読みます。学習用 chapter IDs と順序は `src/tutorial/chapters.ts`、PHP Manual との対応は `src/tutorial/reference-chapters.ts`、版別 registry と manifest は `src/tutorial/content.ts`、対応版と latest は `src/tutorial/config.ts` を読みます。これらの型や ID 一覧を skill、prompt、README に複製しません。

レッスンは構造化データとして作り、画面ごとの JSX や React 分岐で教材を書きません。各 Lesson に意味の分かる Program ID を割り当て、実行する PHP code と必要な JSON input を program registry に置きます。section は学習の順番を示し、blocks は説明、Example と Experiment 選択肢などを順に参照します。実行出力は一つの lab にだけ表示され、本文へ固定出力や別の出力 panel を追加しません。

Lesson の `chapterId` は学習上の chapter を示し、`referenceChapterId` は仕様を照合する PHP Manual chapter を示します。両者を同じ分類とみなさず、learning chapter catalog と official reference catalog を分けて確認します。`chapters.ts` の順が index / syllabus の表示順で、`reference-chapters.ts` は仕様参照とマッピングの正本です。新しい lesson は既存の学習章へ置けるか、前提知識と後続学習を見て決めます。新しい learning chapter が必要なら、その章の境界・学習目標・前後関係を説明します。PHP Manual の全章を教材が扱うとは主張しません。

出版社公式の[『独習PHP 第4版』目次](https://www.shoeisha.co.jp/book/detail/9784798168494)は、前提知識や学習ペースの抜けを比較する材料として使えます。その TOC の順序・章立てをそのまま採用せず、見出し・説明・例文も転用しません。本 tutorial の章は学習順に独自設計し、PHP Language Reference は仕様主張の確認と `referenceChapterId` の対応付けに使います。

この playground はブラウザー内の PHP/WASM 実行を中心にします。lesson の Example と Experiments はページ内で実行できるコードにし、入力を付けるのはコードが `$input` を使う場合だけです。server/request lifecycle、database、Composer や framework/security の運用を教材の coverage として扱うには、対応する runtime・依存関係・検証方法が必要です。現在それらを提供しないため、存在しない支援を暗示せず、実行できるスコープに限ります。将来追加する際は実装可能な lesson scope と一緒に環境を定義します。

`example` block は `sampleProgramId` のコードを表示し、`experiments` block は登録済み Experiment を選べるようにします。各 variant は固有の Program ID を参照します。Example や Experiment を選択したときはコード・入力・draft を切り替え、出力を消します。選択だけでは実行せず、学習者が出力を予測して `Run` を押します。レッスン本文に固定出力や別の Program output panel を追加しません。

Lesson の `goal` は、learner が見られる Example / Experiment のコードまたは動作で具体的に示します。author-only exercise prompt、solution、checker のみで goal を満たした扱いにしません。`Program.input` は実際に `$input` を読む program にだけ持たせます。入力 UI が見えてもコードがその値を参照しなければ、学習者を誤解させます。Experiment は goal を深める小さな一変更に絞り、新しい構文や関数を加えるときは lesson 内で説明するか、順序上の prerequisite lesson を先に置きます。公式 reference のリンクだけで未説明の構文の前提を満たしたことにしません。

演習 grader は `solutionProgramId` と checker cases のコードを共有して使います。`starterProgramId`、prompt、hint、cases は現在 schema に残る author-only metadata です。learner UI に開始・採点操作はありません。これにより、画面に見せる Example / Experiment code と検証用 registry data が別々の文字列になりません。

レッスンは短い目標を持ち、次の学習行動がつながるようにします。

1. Learning chapter index で lesson の位置を把握し、Reference link から仕様の根拠を確認する。
2. Example block でコードを読み、必要なら自分で `Run` して出力を見る。
3. 説明と公式資料で、観察した挙動の理由を知る。
4. Experiment の説明に沿って出力を予測し、その variant を選んで `Run` する。
5. Experiment の実行コードと出力を Example と比較する。

コードのコメント、title、summary、goal、block text、演習文は英語で書きます。実際の出力の空白・改行を正確に確かめます。先行レッスンの知識を暗黙に持ち込まず、例のコードだけで学習目標を追えるようにします。

## 検証の段階

1. 変更前に canonical types と validators を読む。
2. Lesson data と Program registry entry を作る。`validateLesson` / `validateLessons` の実装に沿って構造を確認し、section block が存在する Program ID を参照することを確かめる。
3. 対象版の manifest に登録する。既存 manifest の順序や固定版 URL は、依頼が求める範囲だけ変更する。
4. `groupLessons` で index / syllabus の描画順を確認する。top-level order は learning chapter catalog、各 chapter 内の lesson order は version manifest に従います。Official reference catalog は仕様参照用で、学習順の描画には使いません。raw manifest の全体順だけで画面上の順序を判断せず、empty chapter は表示しないことも確認します。
5. 画面で Example と Experiment の切り替えを確認する。選択だけでは実行されず、Run 前に lab output が空に戻ること、variant ごとに draft/input/code が切り替わることを確認する。
6. 各 version/slug の Example と各 Experiment Program を対象 PHP WASM で実行し、それぞれの [Example CLI baseline](../../../../src/tutorial/authoring/fixtures/example-outputs.json) と [Experiment CLI baseline](../../../../src/tutorial/authoring/fixtures/experiment-outputs.json) に一致するか確かめる。Baselines は PHP 8.5.11 CLI output を起点に作成したが、fixture に per-entry provenance はなく、code 更新後に手動で確認・更新した値も含む。同じ registry code の CLI と WASM の parity を検証するもので、lesson 内容の正しさを独立に検証しない。作者は出力と lesson の意図を確認し、仕様を公式資料で照合する。必要に応じて checker case も runtime E2E で実行し、negative control が該当 case で失敗することを確かめる。詳細は [動的演習の評価と誤判定の検証](exercise-evaluation.md) を参照する。

Example / Experiment の選択、manual Run、variant draft と lab output を確認する public UI E2E:

```sh
npm run test:e2e -- --workers=1 --grep 'experiment variants'
```

全 registered Experiment Program を PHP CLI baseline と照合する author-only WASM test:

```sh
npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'registered Experiment Program against CLI/WASM output baselines'
```

全 registered Example Program を PHP CLI baseline と照合する author-only WASM test:

```sh
npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'every lesson Example against CLI/WASM output baselines'
```

validator の accepted curriculum と malformed fixture を確認する E2E:

```sh
npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'validates each manifest'
```

独立した course sequence と official reference categories の grouping を確認する public UI E2E:

```sh
npm run test:e2e -- --workers=1 --grep 'orders the course from values through functions and objects'
```

Runtime tests use the existing Playwright configuration and Vite server; there is no authoring-only config or package script. Run all tutorial UI and runtime tests together with `npm run test:e2e`.

正しい画面表示だけでは、実行結果が検証されたことになりません。CLI baseline は同じ Program code を別の runtime で実行した出力なので、CLI と WASM の差を見つけますが、コードの意図が正しいかは判定しません。仕様・課題目標に対するレビューも行い、Examples と Experiments が学習者に求める違いを持つこと、選択時は自動実行せず出力前に予測できる時間があることを確認します。

## 版と URL

正本は `src/tutorial/config.ts` と各版 manifest です。既存の固定版 URL は教材を直すだけで latest へ転送しません。共通内容を再利用する場合も、各版 manifest への採用を明示し、含まれる各版で仕様と WASM 実行を確認します。`latestTutorialVersion` を変更する依頼では、新版の全掲載レッスンを対象 runtime で検証してから設定します。URL、草稿置き場、ファイル構成は `doc/tutorial/README.md` を参照してください。

## 終了確認

- Lesson structure と Program ID references が canonical validator に通る。
- official sources が説明した仕様と必要な PHP version difference を支える。
- section order と generic blocks が Example / Experiment を正しい Lesson / Program として表示する。
- Example / Experiment 切り替えが lab draft と input を正しく選び、明示 Run のみで実行する。
- 全 Example と Experiment Program が各掲載 PHP 版 WASM 上で動き、それぞれの CLI baseline と一致する。出力内容は仕様と lesson の学習目標にも照らして review する。
- 全 exercise cases の pass/fail/error と誤答の false-positive を対象 runtime で確かめる。
- latest または version manifest を更新した場合、依頼範囲と検証結果が一致する。
