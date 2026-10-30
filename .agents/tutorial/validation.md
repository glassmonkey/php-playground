# 検証と生成物

変更・レビューの範囲に応じて以下を選ぶ。read-onlyレビューでは既存検証の実行・証拠確認までとし、教材、fixture、checkerの修正・再生成は提案として返す。

1. 構造・参照: `validateLesson` / `validateLessons` とunit testsで必要なフィールド、Program/goal参照、各掲載版の前提順を確認する。
2. 実行: Exampleと全Experimentを対象版WASMで実行し、`src/tutorial/authoring/fixtures/example-outputs.json` / `experiment-outputs.json` の同じ版の値に照合する。版間で期待値をコピー・推測しない。fixtureの `cliVersion` は起点のCLI版であり、各entryの出典や教育的妥当性を保証しない。同じコードのruntime間parityと意味上の正しさを区別する。
3. 意味・教育: 解決済みgoal・本文・コード・学習メモ・実結果・公式資料を照合し、前提と因果説明をレビューする。未確認の版・仕様を検証済みとしない。具体的観点は [学習意図](learning-design.md)。

既存アプリと同じPlaywright/Vite設定を使い、別のbuild rootや検証用Viteを増やさない。必要な対象を選ぶ:

```sh
npm run test:ci
npm run test:e2e -- e2e/tutorial.spec.ts
npm run test:e2e -- e2e/tutorial-runtime.spec.ts
npm run build
```

UIはExample/Experiment切替、draft/input、manual Run、出力消去、版変更と復旧を確認する。runtime suiteはExample/Experimentとsolution/checkerを各対象版で検証する。checkerやケースを扱う場合だけ [演習評価](exercise-evaluation.md) のnegative controlsと互換syntax確認を追加する。

## 記事・版追加に伴うSEO/OGP

`lessonsByVersion` を正に、通常の `npm run build` が `seo-build.ts` から固定版HTML、canonical、sitemap、OGP PNGを同じ公開ディレクトリへ生成する。sitemapの手動追記や画像用の別教材JSONを作らない。記事の正規URL、HTMLのcanonical、sitemapを一致させ、未対応版・latestエイリアスをsitemapに含めない。`/tutorial/` と `/tutorial/latest/` は明示設定された固定版へ転送する。

`og-image.ts` はタイトル・Exampleコード・PHP版から画像を生成する。HTMLのog:image/twitter:imageが生成したPNGを参照すること、長文・コードの改行/省略、同梱フォントとライセンスを確認する。外部フォント取得やOSフォントに依存させない。検証用HTMLを壊さないことも確認する。

完了報告には対象版/slug、一次資料、実行したチェックと結果、意味レビュー、未確認範囲を記す。スキル自体の生成性能は、別の課題と成果物を使う評価で扱い、文書整理や教材レビューの成功だけで性能向上を主張しない。
