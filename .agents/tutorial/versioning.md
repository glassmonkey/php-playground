# PHP教材の版対応

対応版・選択されたlatestは `config.ts` とその参照元、掲載可否と互換変換は `content.ts`、学習メモは `learning-notes.ts` を正とする。教材対応の依頼からruntime loader/WASMビルド/配布基盤まで自動的に広げない。対象runtimeが未提供なら、必要な基盤と未検証範囲を報告する。

## 対応手順

1. 対象版の導入機能・変更仕様を公式PHP Manual/release notesで確認し、掲載可否と各Lessonの直接参照を決める。分類対応が必要なら [仕様参照](language-reference-map.md)。
2. 版解決後の本文、goal、Example/Experiment、理由・誤解、前提、exercise/checkerを照合する。共通文に新しい情報を加えるだけで旧版の意味が変わらないか確認する。既存の限定的な変換で足りるならresolverを全面改修しない。
3. runtime一覧から教材も生成されるため、新runtimeが追加された場合は、その版の全生成Lessonとfeature gateを公開前に検証する。自動生成を互換性確認とみなさない。各版の期待出力を実WASMで確認してfixtureへ登録し、既存版への影響も検証する。[検証](validation.md) を使い、checker変更時は [演習評価](exercise-evaluation.md) も読む。
4. latest更新が明示依頼された場合だけ、対象教材の全検証後に `latestTutorialVersion` を変更する。固定版URLをlatestへ転送せず、生成HTML・sitemap・OGP・aliasの整合性を確認する。

以下は安定した機能導入版の確認例であり、現行の対応版一覧や完全なfeature gate一覧ではない。

| Feature | First PHP version | Authoring rule | Official source |
|---|---:|---|---|
| Scalar parameter types and return types | 7.0 | For PHP 5.6, use untyped signatures and explain the version difference when relevant. | [PHP 7.0 new features](https://www.php.net/manual/en/migration70.new-features.php) |
| `intdiv()` | 7.0 | Use compatible arithmetic in PHP 5.6 programs, or omit the call from that version's variant. | [`intdiv()`](https://www.php.net/manual/en/function.intdiv.php) |
| `void` return type and nullable types | 7.1 | Do not put these declarations in PHP 5.6 or 7.0 program variants. | [Type declarations](https://www.php.net/manual/en/language.types.declarations.php) |
| Typed class properties | 7.4 | Use an untyped property or a version-specific lesson/program before 7.4. | [Properties](https://www.php.net/manual/en/language.oop5.properties.php) |
| `mixed` type and `match` expression | 8.0 | Keep them out of all 5.6/7.x sources. Because checker PHP is parsed by the selected runtime too, checker files must also avoid newer syntax when testing older versions. | [Type declarations](https://www.php.net/manual/en/language.types.declarations.php), [`match`](https://www.php.net/manual/en/control-structures.match.php) |
| Enums | 8.1 | Include enum lessons only in manifests for PHP 8.1 and later. | [Enums overview](https://www.php.net/manual/en/language.enumerations.overview.php) |
| Property hooks | 8.4 | Include hook lessons only in manifests for PHP 8.4 and later. | [Property Hooks](https://www.php.net/manual/en/language.oop5.property-hooks.php) |

This table is a minimum source review, not a promise that any lesson using a listed feature has already been independently audited. Before adding a syntax construct, function, or behavior, verify its introduction/availability on the official page and run the exact Example, Experiment, solution, and checker on every version that includes it.

For extension functions, verify that the extension is enabled in each target PHP/WASM runtime as well as checking the PHP Manual page. A function appearing in the official library reference does not by itself prove the playground build includes its extension.

The output fixtures are keyed by PHP version. Keep `versions[version]` metadata for every registered program and experiment; do not fill one version's output by copying another version's output or from the CLI version label. Run each program on the selected WASM runtime and compare with the stored value for that same version. If an output differs by version, retain separate expected strings. CLI output baselines identify their origin version, but their entries do not carry full provenance and do not independently prove semantic correctness.

Read the selected latest version from `latestTutorialVersion` in `src/tutorial/config.ts`. This is an explicit curriculum choice, not an inference from the newest or oldest bundled runtime. Change it only when explicitly requested and after the full lesson set for that target has been reviewed and run.


完了条件は、掲載可否・構文・説明/学習メモ・期待出力・checker・既存版への影響が対象runtimeで確認され、未提供/未確認の項目とlatest変更有無が報告されること。
