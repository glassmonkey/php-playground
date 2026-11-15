# PHPantom versioned WASI runtime

The PHPantom runtime is built from the upstream PHPantom source archive at a
pinned commit. The build applies a reviewed, checksum-pinned patch that sets
the selected PHP target before analysis and filters core builtin availability
and native parameters. User-defined symbols and PHPDoc parameters are covered
by the focused regression probe. User-code parsing and syntax diagnostics are
not version-aware, and full inventories for every PHP extension are outside
scope.

Browser runtime adapters and version helpers live in `src/lsp/phpantom/`.
The Docker builder, pinned patches, native probe, and Node validation tools live
in the sibling build module `src/lsp/wasm/`, like `src/php-wasm/` and `src/wasm/`.
The build module is excluded from browser TypeScript declaration generation;
ESLint checks the Node CLIs with explicit environments; the UI validation
harness also contains browser callbacks. Browser runtime
checks remain unchanged, and build tools are not browser entrypoints.
`build-wasm.sh` resolves the repository root three levels above the build module.
Docker uses the repository root as context with the module-specific
`Dockerfile.dockerignore` allowlist.

## Reproducible candidate build

The source pin is PHPantom `49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668`, with
archive SHA-256
`f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d` and
Cargo.lock SHA-256
`0a601fc471628943f15c4e3f97649b99417b1037cf4f824bd835e8a3a12fad1d`. The
build applies patch SHA-256
`4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d` and
checks all 15 changed source files against the adjacent file manifest before
compilation.

The full JetBrains stubs pin is
`2049ca3cfa1feabf52db074108fe776a5713cf02`, archive SHA-256
`3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7`. The
builder verifies the complete embedded tree and records its map hash, file
count, and target in candidate provenance.

Docker uses Rust 1.99.0 from the immutable image
`rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6`.
Each run downloads and hashes the upstream archive, applies the patch, checks
the exact stub pin, then emits a WASI candidate and provenance under
`build/phpantom-versioned-candidates/`. After the WASI gate passes it also
exports `php-<target>.wasm` and matching
`php-<target>.provenance.json` to `build/phpantom-runtime/<target>/`. The module
never writes to assets or public output.

Build a candidate for a supported PHP target (5.6, 7.0–7.4, or 8.0–8.5):

```sh
make test-phpantom-runtime-native
make build-phpantom-runtime PHPANTOM_TARGET_VERSION=8.0
```

`build-phpantom-runtime` produces and tests artifacts only. Explicit asset placement
belongs to the repository Makefile:

```sh
make install-phpantom-runtime PHPANTOM_TARGET_VERSION=8.0
# Exercise distribution without changing tracked assets:
make install-phpantom-runtime PHPANTOM_TARGET_VERSION=8.0 PHPANTOM_ASSET_DIR=/tmp/phpantom-assets
```

Installation depends on a successful build, then copies the versioned WASM and
provenance. `PHPANTOM_BUILD_DIR` overrides the build output root;
`PHPANTOM_CANDIDATE_DIR` can isolate candidate records during validation.
Repeating a build or running build then install reuses an existing immutable
candidate only after its bytes, checksum and stable source/stubs/build provenance
match the new build. The original candidate and its logs remain untouched; each
attempt retains its own WASI result. Corruption or a pin mismatch fails before
asset placement.
The provenance artifact path matches the installed versioned filename. The UI
owner must update its registry/manifest and hashes together when adopting these
bytes; this command does not update UI metadata or deploy a site. The legacy
`phpantom_lsp.wasm` is not an installation target.

native の公開回帰は raw 7/7、終了コード 0 を必須にします。同名の利用者関数の PHPDoc も必須の assertion です。既知の失敗を成功に変換しません。classifier は全 7 件の結果、各テストの最後に出る完了 sentinel、失敗一覧と最終集計の整合性を確認します。途中で切れたログ、異なる panic、追加の失敗、0 件実行を拒否します。`native-probe-result.json` の `knownLimitMatched` は過去の読取形式を維持するための項目で、常に false です。

追加の `native_release_quality` も CI の必須検査です。固定 stubs に対する独立オラクル 14 API × 12 対象を、各ケース別の Backend で cold と warm の両方から検査します。warm は同じ stub ファイルの別シンボルへの公開 completion と resolve で作ります。関数、クラス、interface、定数、メソッド、削除境界に加え、クラス定数、プロパティ、引数と型の境界を検査します。同名引数の版違い、利用者のソース、編集後の docs、別名と名前衝突も対象です。メタデータの scanner 16 件と独立ガード 2 件は補助検査です。

resolve は補完項目に保存した索引の FQN を直接参照します。入力元の namespace を再付加しません。関数の挿入は選択した FQN と呼出し側の別名・同名関数から決め、バックスラッシュを含む入力全体を明示的な textEdit で置換します。補完の主編集と追加 import 編集を適用した全文も回帰検査します。

版の選別は API の許可リストを使いません。`PhpStormStubsElementAvailable` の正しい属性名・別名・FQN とその属性の引数だけを解釈します。PHP に属する stub の `@since` と `@removed` は cold 索引と lazy パースの両方に適用します。拡張のリリース番号を PHP の版として解釈しません。利用者のファイルはパーサの由来情報で版選別の対象外にします。属性、引数の型、PHPDoc の補足情報は既存のパーサで維持します。メタデータのない全 API の歴史を推定できるわけではなく、代表例の成功だけで全 inventory の正しさは証明できません。

CI は native の後に 7.4、8.0、8.3、8.4、8.5 を順番に生成して、各生成物の WASI 公開要求を検査します。WASI でも利用者 docs、選択した関数の全文編集、各対象の独立 family オラクル、メンバーと型の境界を必須にします。失敗を knownLimits として許容しません。ソース gate 後の全 12 対象バッチでも、この同じハーネスを対象ごとの実 WASM に対して実行する必要があります。native の成功から他版の WASM の成功は推定しません。

このソース変更だけでは追跡中の 12 WASM と UI の hash metadata は更新しません。全対象の実生成・WASI 検証・provenance 確認の後、UI 担当が同じソースの生成物と registry を一緒に採用し、採用した各資産の SHA-256 を再確認します。ソース検証、WASI 検証、ブラウザ検証、出荷判定はそれぞれ別の証拠を必要とします。

Run the same production classifier/verifier regression cases used by CI:

```sh
node --test src/lsp/wasm/test-build-tools.mjs
```

言語補完は stub API の版選別と別に、対象版と宣言位置から候補を生成します。次の表の 5.6 は対応下限であり、その版で初めて導入されたという意味ではありません。既存の構文位置の判定を維持し、利用者の同名 class/function を keyword と一緒に除外しません。

| keyword の候補 | 対応下限 | 追加の位置条件 |
| --- | --- | --- |
| fn | 7.4 | 既存の式・文脈判定を使用 |
| match | 8.0 | 同上 |
| enum | 8.1 | 同上 |
| readonly | 8.1 | class/trait の property 位置。static property には提示しない |
| readonly | 8.2 | class 宣言を開始できる既存の位置 |
| その他の現在の候補 | 5.6 | return は script/function、yield は function 内。break/continue、case/default、namespace、extends/implements と class body の条件も適用 |

その他の候補は abstract、as、break、case、catch、class、clone、const、continue、declare、default、die、do、echo、else、elseif、empty、eval、exit、extends、final、finally、for、foreach、function、global、goto、if、implements、include、include_once、instanceof、interface、isset、list、namespace、new、print、private、protected、public、require、require_once、return、static、switch、throw、trait、try、unset、use、while、yield です。未知の keyword を新しい上流一覧へ追加しても、この版の表に登録されるまでは提示しません。

導入版は [PHP 7.4 の新機能](https://www.php.net/manual/en/migration74.new-features.php)、[PHP 8.0 の新機能](https://www.php.net/manual/en/migration80.new-features.php)、[PHP 8.1 の新機能](https://www.php.net/manual/en/migration81.new-features.php)、[readonly class の説明](https://www.php.net/manual/en/language.oop5.basic.php#language.oop5.basic.class.readonly)で確認しています。enum の backing type の int/string も 8.1 未満には提示しません。

| 宣言型の候補 | 対応下限 | 位置の制約 |
| --- | --- | --- |
| array / callable / self / parent | 5.6 | self は class 内、parent は親 class がある場合。callable は property/昇格 property/class 定数に使わない |
| string / int / float / bool | 7.0 | 宣言位置の対応版を追加適用 |
| iterable | 7.1 | 同上 |
| object | 7.2 | 同上 |
| mixed | 8.0 | 単独型。nullable/union/intersection に使わない |
| void | 7.1 | 戻り型だけ。複合型に使わない |
| never | 8.1 | 戻り型だけ。複合型に使わない |
| static | 8.0 | class 内の戻り型だけ |
| false / null | 単独型は 8.2、union 内は 8.0 | null は nullable の基底型に使わない |
| true | 8.2 | 宣言位置と複合型の制約も適用 |

戻り型の位置自体は 7.0、property は 7.4、昇格 property は 8.0、class 定数は 8.3 からにします。class 定数は小文字で始めた native 型の入力を扱い、大文字で入力中の定数名は従来の名前位置として残します。nullable は 7.1、union は 8.0、intersection は 8.1、DNF は 8.2 を必要とします。intersection 内には native 型を提示せず、class 名の経路を維持します。重複型、bool と true/false、iterable と array など、既に入力された native 型との明白な重複も提示しません。PHPDoc の補足型はこの native 宣言用の表に通しません。

この表は [PHP 7.0 の型宣言](https://www.php.net/manual/en/migration70.new-features.php)、[PHP 7.1 の型宣言](https://www.php.net/manual/en/migration71.new-features.php)、[PHP 7.2 の object 型](https://www.php.net/manual/en/migration72.new-features.php)、[型宣言の変更履歴と使用制約](https://www.php.net/manual/en/language.types.declarations.php)を根拠にしています。補完の候補生成だけを変え、parser や診断の対応構文を追加するものではありません。

必須 native 検査には、独立した言語表の各ケースに全 12 対象の期待値を明記した公開 completion 回帰と、scanner/lazy parser の namespace import・grouped import・heredoc/nowdoc・匿名 class の比較を含めます。固定した Core/Core_d.php の一括定数宣言は、全 declarator に同じ metadata を適用します。PHP_SBINDIR と PHP_OUTPUT_HANDLER_PROCESSED を cold/warm の両方で検査します。元の 14 API オラクルは件数 168、全 14 シンボルと全 12 対象の集合を先に照合し、空や欠落した表による成功を拒否します。

release 用の単独 WASI ハーネスは、実行前に current applied patch と file manifest の両 SHA-256 を必須にします。旧 bundle だけでの代替受理はしません。欠落・旧値・異なる値を使った 6 件の CLI 反例で、WASM を開く前の拒否を検査します。過去の raw 記録は保全し、新しい release の証明とは分けます。CI の WASI 対象には 8.4 の定数境界も含め、7.4/8.0/8.3/8.4/8.5 を検査します。全 12 対象の採用には、別途許可された実生成と対象別の同じハーネス実行が必要です。

複合型の入力でも class 定数の宣言位置を保持します。nullable、union、intersection、DNF の途中で通常の関数候補へ戻しません。8.3 未満の class 定数型は候補を出さず、型を入力済みの後ろに続く定数名は型位置と区別します。既出の native 型は比較用のキーだけを小文字へ正規化し、mixed/void/never、bool と true/false、重複の規則を入力の大小文字にかかわらず適用します。利用者 class の表示名と挿入文字列は変更しません。

return は関数だけでなく script/eval/include の終了にも使えます。従来の return-outside-function の全12期待値が負だったのは誤りで、[PHP の return の説明](https://www.php.net/manual/en/function.return.php)に従って正に訂正しました。旧期待値と修正前の失敗を保全し、class/trait/interface body の負、関数・method・namespace・条件付き script の正、yield の関数内の正と script 位置の負を分けて検査します。

scanner は class owner の深さを stack で保存・復元します。入れ子の匿名・名前付き class を閉じた後も外側の所有状態を保持し、外側 method や class 定数を global 宣言へ混入させません。synthetic な所有状態の反例と、固定 stub ファイル群への影響確認と、lazy parser の公開要求の比較は別々の証拠として扱います。

namespace の import 種別は固定版 PHP parser の CST で判定します。`use` と `function` / `const` の間に空白やコメントがあっても種別を保ち、closure の capture と trait use は別の構文として扱います。同じファイルの別 namespace にある function/const は import 候補へ残します。21 fixture を全12対象の公開 native completion と、生成対象ごとの WASI completion で検査します。

未完成の class/namespace では、parser へ渡す一時入力の末尾だけに終端記号と閉じ括弧を補い、元の cursor と span を保持します。補完する文書自体は書き換えません。コメント内の括弧で import と trait use が入れ替わらないことと、trait use に通常 class が混入しないことも検査します。

Group import では、共通 namespace、現在 item の class/function/const 種別、入力中の名前、UTF-16 の置換範囲を一つの context として候補生成へ渡します。group の `}` を statement の `;` より前に補って CST を回復し、空 item に使う一時 identifier は検索名や実文書へ含めません。挿入するのは共通 prefix に対する相対名だけです。明示した primary edit を返し、呼出し snippet、別の use 追加、二重 prefix は返しません。既存 alias、隣の item、文書内の group 終端は保持します。

27 fixture は mixed/typed group、2番目 item、alias と同名の利用者定義、コメント・改行・UTF-16、相対 namespace、通常 import、token 途中の cursor を含みます。公開 completion と resolve の編集 payload 全体と、全編集適用後の文書を独立期待値と比較します。必須 native CI と各対象の standalone WASI の双方で実行します。[PHP 7.0 の group use 導入](https://www.php.net/manual/en/migration70.new-features.php)に従い、5.6 では group の負、通常 import の正を検査します。元の全12対象の通常 import・trait use・closure capture と言語型の検査も維持します。LSP 編集の適用と実 PHP の binding 確認は、Monaco での accept 実測とは区別します。

native の headless Backend は、didChange 完了時に解析結果も公開するようにします。client がない逐次操作では refresh 通知を待てず、以前は rename 直後の completion が古い function index と競合しました。headless constructor の同期設定を直し、即時の group function rename と既存の doc/edit 回帰を検査します。client 付き LSP の background 設定は変更しません。WASI dispatcher は従来から文書変更を同期で登録します。
