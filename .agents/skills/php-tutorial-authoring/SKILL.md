---
name: php-tutorial-authoring
description: Create, revise, or evaluate lessons and exercises in this repository's versioned PHP Playground tutorial. Use for tutorial content and exercise checks, not general PHP questions.
---

# PHP Playground チュートリアルの執筆と評価

このスキルは、PHP Playground に載せる初心者向けレッスンと演習を追加・更新・レビューするときに使います。画面に出す教材は英語で作成します。

作業前に `doc/tutorial/README.md` でリポジトリ固有のルートとファイル配置を確認し、`src/tutorial/config.ts`、`src/tutorial/types.ts`、`src/tutorial/chapters.ts`、`src/tutorial/reference-chapters.ts`、`src/tutorial/content.ts` を読みます。版、Lesson 型、learning/reference chapter IDs、演習評価の正本はコードです。スキルや文書に型定義を複製せず、コードの契約に従います。

レッスンは汎用 renderer が表示する構造化データとして作成します。学習者向け chapter sequence は前提知識と学習の段階を軸に独自に設計します。出版社公式の[『独習PHP 第4版』目次](https://www.shoeisha.co.jp/book/detail/9784798168494)は話題や前提順の検討材料にできますが、順序や章立てをそのまま再現せず、見出し・解説・例も転用しません。教材の `chapterId` と表示順は learning catalog、仕様上の対応は `referenceChapterId` と official reference catalog で別々に管理します。PHP の仕様確認には公式 PHP Manual / release notes を使い、Lesson に一次資料リンクを記録します。レッスンごとの JSX、React 分岐、出力の手書き表示を追加せず、canonical registry に登録できる Lesson / Program / Experiment データを作ります。Example/Experiment の選択後はコードと input を切り替えて lab output をクリアし、`Run` 操作の後にだけ PHP を実行します。作業は次の二段階で行います。

1. Lesson と program registry の構造化データを作成し、section と block を順序づけ、program ID でコード例・実行出力・演習解答を参照させます。
2. schema と registry 参照を検証し、対象版 manifest に登録してから、汎用 renderer と選択した版の WASM runtime で表示・実行を確認します。演習ケースの採点は learner UI ではなく `e2e/tutorial-runtime.spec.ts` から authoring WASM harness を検証します。

詳細は [構造化レッスンと一次資料](references/lesson-authoring.md) を読みます。learning chapter と official PHP reference の対応では [学習章・仕様参照マップ](references/language-reference-map.md) も確認します。演習を追加・変更・レビューするときは、これらに加えて [動的演習の評価と誤判定の検証](references/exercise-evaluation.md) を読みます。

再利用可能な依頼雛形は `prompts/add-lesson.md`、`prompts/update-version.md`、`prompts/review.md` にあります。

実行環境はブラウザー内 PHP/WASM playground です。まずこの環境だけで学習目標を実行・検証できる話題を扱います。HTTP server、request lifecycle、database、Composer や framework の運用/security は server-side environment や外部依存を要求するため、実行基盤と評価方法を整えるまでカリキュラムの coverage に含めません。範囲外の話題は既存 lesson に無理に寄せず、具体的な前提・runtime・検証方法を設計してから新しい learning chapter を検討します。曖昧な “Projects” や “Supplemental” の catch-all chapter は作りません。

現行の bundled PHP runtime は `src/tutorial/config.ts` の12版、5.6、7.0–7.4、8.0–8.5 です。教材はリスト中の掲載版で動かし、version-specific syntax / function / behavior が lesson と manifest に合うようにします。新しい PHP feature を古い版のソースへ混ぜず、Lesson を該当版以降にだけ載せるか、古い版用に明示的な構文と説明を用意します。最低限の現行 feature gate は [version matrix](references/language-reference-map.md#runtime-and-feature-compatibility) を参照してください。

主張する PHP の仕様は、対象版の公式 PHP Manual や公式 release notes で確認し、該当箇所への link を各 Lesson に記録します。Example と全 Experiment Program は各掲載版の Playground WebAssembly runtime で実行し、version ごとに保存された `src/tutorial/authoring/fixtures/example-outputs.json` と `experiment-outputs.json` の expected output に照合します。expected output を版間で共有・推測せず、版ごとに実行して記録します。CLI baseline と WASM の一致が示すのは実行結果の parity です。fixture に per-entry provenance はなく、code 更新後に手動で確認・更新した値も含みます。テストは期待された意味や学習目標の正しさを独立に証明しません。作者は出力が lesson の意図と公式資料に合うか別途 review し、未確認の内容を検証済みと扱いません。

各 `goal` は learner に見える Example / Experiment の中で確かめられる形にします。Program.input は code が `$input` を使う場合だけ設定します。Experiment に新しい構文や関数を入れるときは lesson 内で説明するか、先行する lesson で教えます。画面の chapter / lesson 順は raw manifest だけでなく `groupLessons` に基づいて確かめます。

版追加・更新では、各 Lesson の可用性、Example/Experiment code、exercise checker syntax、PHP behavior、expected output をその版の runtime で別々に確認します。Runtime registry の追加だけで curriculum の lesson/version coverage や latest を自動で拡張しません。固定 version URL を保ち、`latestTutorialVersion` は対象カリキュラム全体を検証したうえで依頼された場合だけ変更します。現行 latest 8.5 は12 runtime のうち curriculum が意図して選んだ版です。詳細は `doc/tutorial/README.md` を参照します。

完了時は、変更した版・slug、参照した一次資料、Playground で実行したサンプルとケース、意図的な誤答による評価確認、未確認事項を報告します。検証不能な結果を推測で埋めません。

記事・版の追加時は `lessonsByVersion` を正本にします。通常の `npm run build` が `src/tutorial/seo-build.ts` から固定版の HTML、canonical、sitemap.xml、OGP PNG を同じ公開ディレクトリへ生成するため、サイトマップを手作業で追記しません。生成物で対象記事の URL と canonical が一致し、未対応版や latest エイリアスが sitemap に含まれないことを確認します。`/tutorial/` と `/tutorial/latest/` は設定された固定版へ転送し、canonical は常に本番ドメインの固定版 URL にします。

OGP は `src/tutorial/og-image.ts` が Lesson の title・sampleProgramId が参照する Example コードと PHP 版から生成します。画像用の文言や JSON を別管理せず、記事データの更新に追従させます。通常ビルドで生成される記事の `og.png` と `og:image` / `twitter:image` の対応を確認し、長いタイトルや Example コードを更新した場合は画像の改行・省略も目視確認します。フォントはライセンス付きで同梱し、外部フォント取得や OS フォントに依存させません。
