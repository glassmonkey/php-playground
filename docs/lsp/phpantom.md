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
ESLint checks its two Node CLIs with the Node environment. Browser runtime
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

追加の `native_release_quality` も CI の必須検査です。固定 stubs に対する独立オラクル 14 API × 12 対象を、各ケース別の Backend で cold と warm の両方から検査します。warm は同じ stub ファイルの別シンボルへの公開 completion と resolve で作ります。関数、クラス、interface、定数、メソッド、削除境界に加え、クラス定数、プロパティ、引数と型の境界を検査します。同名引数の版違い、利用者のソース、編集後の docs、別名と名前衝突も対象です。メタデータの scanner 8 件と独立ガード 2 件は補助検査です。

resolve は補完項目に保存した索引の FQN を直接参照します。入力元の namespace を再付加しません。関数の挿入は選択した FQN と呼出し側の別名・同名関数から決め、バックスラッシュを含む入力全体を明示的な textEdit で置換します。補完の主編集と追加 import 編集を適用した全文も回帰検査します。

版の選別は API の許可リストを使いません。`PhpStormStubsElementAvailable` の正しい属性名・別名・FQN とその属性の引数だけを解釈します。PHP に属する stub の `@since` と `@removed` は cold 索引と lazy パースの両方に適用します。拡張のリリース番号を PHP の版として解釈しません。利用者のファイルはパーサの由来情報で版選別の対象外にします。属性、引数の型、PHPDoc の補足情報は既存のパーサで維持します。メタデータのない全 API の歴史を推定できるわけではなく、代表例の成功だけで全 inventory の正しさは証明できません。

CI は native の後に 7.4、8.0、8.3、8.5 を順番に生成して、各生成物の WASI 公開要求を検査します。WASI でも利用者 docs、選択した関数の全文編集、各対象の独立 family オラクル、メンバーと型の境界を必須にします。失敗を knownLimits として許容しません。ソース gate 後の全 12 対象バッチでも、この同じハーネスを対象ごとの実 WASM に対して実行する必要があります。native の成功から他版の WASM の成功は推定しません。

このソース変更だけでは追跡中の 12 WASM と UI の hash metadata は更新しません。全対象の実生成・WASI 検証・provenance 確認の後、UI 担当が同じソースの生成物と registry を一緒に採用し、採用した各資産の SHA-256 を再確認します。ソース検証、WASI 検証、ブラウザ検証、出荷判定はそれぞれ別の証拠を必要とします。

Run the same production classifier/verifier regression cases used by CI:

```sh
node --test src/lsp/wasm/test-build-tools.mjs
```
