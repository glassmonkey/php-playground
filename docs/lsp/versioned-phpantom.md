# Versioned PHPantom runtime

The playground selects a PHPantom WASM by the PHP version in the URL. The
supported targets are PHP 5.6, 7.0–7.4, and 8.0–8.5. Each version has a
separate file at `assets/lsp/phpantom/php-<version>.wasm`; the Worker requests
`/lsp/phpantom/php-<version>.wasm?sha256=<expected-hash>`. The client checks
both byte count and SHA-256 before compiling. Compiled modules are cached by
version and hash, and every version switch starts a fresh analysis Worker.
Turning autocomplete off creates no PHPantom Worker and fetches no PHPantom
WASM.

The public [`manifest.json`](../../assets/lsp/phpantom/manifest.json) records
the exact artifact hashes, sizes, per-artifact source patch and provenance
hashes, plus the upstream PHPantom and phpstorm-stubs pins. PHPantom is MIT
licensed. JetBrains phpstorm-stubs is Apache-2.0; its repository includes PHP
manual material under CC BY 3.0. See the linked upstream license files in the
manifest.

## Build and verify

The Docker builder downloads the pinned PHPantom source archive, verifies its
SHA-256, applies the complete reviewed source patch, and checks the changed-file
manifest before building. The build pins the PHPStorm stubs commit and archive
SHA-256 and uses the pinned Rust 1.99 image. No PHPantom source is vendored in
this app repository. Build a candidate with
`make build-phpantom-runtime PHPANTOM_TARGET_VERSION=8.0`; run the native probe
with `make test-phpantom-runtime-native`. Candidate artifacts and provenance are
retained under `build/phpantom-versioned-candidates/`. The module generates and
verifies output; the repository Makefile owns distribution through the explicit
`make install-phpantom-runtime PHPANTOM_TARGET_VERSION=8.0` target, which copies
the selected versioned WASM and provenance into `PHPANTOM_ASSET_DIR`
(default: `assets/lsp/phpantom`).

資産の配置だけでは採用済み metadata を自動で更新しません。 Installing different bytes for UI use requires a
manual, reviewed update of the matching version row in both the manifest and
registry, including its hash, size, build identity and provenance. Installation
does not approve new metadata automatically. Use an isolated destination to
check distribution without replacing the reviewed assets.

To verify the browser build and all 12 selected artifacts:

```sh
npm run test:ci
npm run build:types
npm run lint:js
npm run build
npx vite preview --host 127.0.0.1 --port 4176
```

In another terminal, run `node src/lsp/wasm/versioned-ui-test.mjs`. It reads the
committed manifest by default. `PLAYWRIGHT_BASE_URL` selects another preview
URL, `PHPANTOM_MATRIX_VERSIONS` selects a comma-separated subset, and
`PHPANTOM_MATRIX_OUT` sets the report path. Named-argument behavior is checked
with an explicit completion request; normal builtin completion and insertion
are checked by natural typing.

## 必須の意味検証と未達項目

必須の Playwright workflow は、通常の E2E に加えて
`node src/lsp/wasm/release-ui-test.mjs` を実行する。production build を専用の
preview で開き、PHP 8.0・8.3・8.5 の26ケースと review の54ケースを確認する。
元の全12版101ケースは残してあり、この部分集合を全版の保証とは扱わない。
名前付き引数のケースは明示的な補完要求であり、通常の自然入力の証拠と区別する。

hover と signature は RPC の内容だけでなく、可視 widget の本文にも
引数名と版の境界が現れることを検証する。関数のケースでは自然入力から候補を選び、
resolve に送った FQN、表示された説明、確定文書、実 PHP の呼出し先を確認する。
resolve-only の import は制御した応答の fixture であり、実 engine がその形式を
自然に返すことを証明するものではない。

初期 assets で失敗した user PHPDoc、同名 symbol の説明、global 関数の binding の記録は保存する。
今回の12版は runtime source `be1e180cc1b495c46e34a2f73f559ff6f0b7430e` の実生成 batch を採用した。
manifest の `candidateBatchIndexSha256` は候補一覧を、各行の `candidateProvenanceSha256` は生成元の provenance を識別する。
公開する provenance は既存の export 契約に従って `artifact.path` だけを `php-<version>.wasm` に変え、
その SHA-256 を manifest と registry に保存する。WASM 本体の bytes と hash は候補と同一にする。
upstream と stubs の pin、および license は変更しない。資産採用と実ブラウザの成功、出荷判定は区別する。

review には grouped import の自然入力6ケース、明示要求の補助2ケース、初期化・Worker error・版の往復4ケースを含める。
単語途中の自然入力2ケースは app 側の限定した補完 hook も対象にする。
補助2ケースで範囲置換が成功しても、自然入力の成功には数えない。元の失敗や assertion を削除しない。

検証器は `build/phpantom-release-evidence/` に source/head/build の hash、
開始、個別結果、終了と実際の exit code を排他的に保存する。
1子プロセスは180秒、全体は420秒を上限とし、自動再試行しない。
`PHPANTOM_RELEASE_BUILD` と `PHPANTOM_RELEASE_OUT` で入力と証拠の保存先を指定できる。
`PLAYWRIGHT_BASE_URL` を指定した場合は既存 preview を使い、そのプロセスを停止しない。
局所診断の `PHPANTOM_RELEASE_PHASE=matrix|review|semantics` は実行範囲を記録する。
CI の既定値 `all` は全必須群を実行し、未実施群を成功に含めない。

hover の初回失敗では pointer、hit target、widget、model/version、provider/token、
RPC とスクリーンショットを保存する。観測の追加自体が時刻へ影響する可能性は残る。
過去の no-RPC 失敗は、後続実行が成功しても原因解明まで未解決として保持する。
通常 E2E も最初の失敗から trace と画面状態を保存する。
CI の retry 後の成功は、初回の失敗原因が修正された証拠とはしない。

末尾のURL・既定値・OFF・履歴3ケースは、`PHPANTOM_MATRIX_CASES=tail` で
独立に実行できる。通常ページと末尾ページは同じWorker観測器を使う。
観測器が元Workerへinitializeとtransferを同一のまま渡すことを、小さい公開経路の試験で確認する。
manifestはsubsetの選択に関係なく、期待する全12版の集合と照合する。
重複JSON key、欠落・余分な版、重複・無効な選択は実行前に拒否する。

関数の確定文書とPHP実行文書はfixture内の独立した全文期待値と照合し、コメントや
無関係な行の削除も検出する。署名は入力した関数、順序付きの型・引数名、activeParameterと
可視の強調位置を確認する。現在のsignatureHelp labelにはFQNがないため、関数identityは
完全一致する文書と要求位置にも結び付ける。

応答しないHTTP、子timeout、spawn errorでは開始・結果・終了と実際の数値exitを
小さい実プロセスで照合する。stdoutとstderrはexitではなくcloseまで取得する。
`PHPANTOM_RELEASE_FETCH_TIMEOUT_MS` は局所試験でfetch上限を短縮する指定であり、
既定の10秒より長くすることはできない。

K3のfamily別availabilityはruntime担当の必須native/WASI oracleとCI連携のgateを待つ。
UIの既存3版subsetがその代わりを検証したとは扱わず、managerがexact gateを受け入れるまで
未達の項目として残す。

PHPantom専用の検証CLIとhelperもbuild module内の `src/lsp/wasm` に置く。
`release-ui-test.mjs` は自身の位置からrepository rootを解決する。
`PHPANTOM_RELEASE_PHASE=tail` は専用previewの起動から末尾3ケースまでを検証する。
局所試験の専用portは `PHPANTOM_RELEASE_PREVIEW_PORT` で指定できる。
既存previewを使う `PLAYWRIGHT_BASE_URL` とは区別し、専用子プロセスだけを終了する。

source capture は、fallible な処理を始める前に START を保存する。
テキスト差分は WASM を除外した `source.diff` に直接保存し、12 binary は path・byte数・SHA-256 で識別する。
`HEAD.json` を最初の Git 確認直後に保存し、binary/build の capture に失敗しても取得済み head を終了記録に残す。
`capture.json` と `source.json` を分け、capture 失敗時も startup error・result・EXIT と実際の数値 exit を残す。
差分取得は5秒、テキスト差分の保存量は16 MiBを上限とする。binary patch を同期出力 buffer に蓄積しない。

hover の準備では、didChange と一致する model の確認だけで mouse 座標を確定しない。
描画された token の range が正の幅・高さを持ち、実際の hit target が同じ editor の対象位置であることを確認する。
その後に元の mouse 操作を行い、provider・RPC・可視 tooltip 本文を検証する。ゼロ矩形を一度だけ返す制御 fixture も用意する。
過去の失敗記録がこの原因と結び付いていない場合は、修正後の成功だけで原因を断定しない。

単語途中の補完は接続済みの PHP model と Auto complete が有効な期間だけ購読する。
公開 key/model event から、選択を置換しない単一 identifier 文字の挿入と model version を確認する。
通常の単語末、paste、削除、IME の途中、programmatic な変更には追加要求を行わない。
既に候補 widget が開いている場合は、選択や resolve を再開し直さない。OFF・版切替・model 変更・unmount・Worker error では購読を解除する。

字句判定は稀な対象入力でのみ公開 tokenize を使い、先行行の状態を含む全文を渡す。
CDN Monaco 0.55.1 は heredoc/backtick 本文を identifier、PHP8 attribute を行コメントと分類する。
PHPタグと code/opaque の状態を一度走査し、コメント・引用符・backtick・heredoc/nowdoc と PHP8 の `#[` を扱う。
標準 `<?php` と `<?=` に加え、既存 app の convertCodeToPhpPlayground が扱う空白付き `<?` を認識する。`<?xml` や `<?phpfoo` を標準PHPタグとして扱わず、新たなshort_open_tag設定は行わない。
[PHP の文字列構文](https://www.php.net/manual/en/language.types.string.php)と
[PHP 7.3 の変更](https://www.php.net/manual/en/migration73.new-features.php)に従い、quoted label、identifier 境界、改行、indent と版の違いを扱う。
本文は判定用のコピーだけで UTF16 長と改行を維持して空白に置換する。model、候補の FQN、engine の絞り込みは変更しない。
不明な字句状態や tokenize の例外では追加要求を抑制する。一般の PHP parser や診断器としては使用しない。
不透明区間と PHP8 `#[` の `#` だけを判定用コピーで空白化し、公開 tokenize は対象コードに対して一回だけ呼ぶ。
閉じた heredoc ごとの全文再計算は行わない。文書長に依存する走査と tokenize の仕事は残り、数値の性能保証は設定しない。
review の追加14ケースは、コメント・文字列・HTML・heredoc/nowdoc の要求抑制、終端後の PHP と 7.2/7.3 の境界を実ブラウザと PHP 出力で確認する。

backtick は [PHP の実行演算子](https://www.php.net/manual/en/language.operators.execution.php)として不透明に扱う。
PHP8.5 は未実行の関数内でも非推奨診断を出すため、試験は[公式の8.5変更](https://www.php.net/manual/en/migration85.deprecated.php)に沿った診断全文とstdoutを分けずに検証し、出力を消さない。
attribute は PHP8以降だけコードとして扱い、以前の `#` は行末までのコメントとする。`//` と `#` は改行か `?>` で終わるが、block commentや文字列の内部ではPHPタグにより外側状態を変更しない。

候補 item に明示 LSP textEdit がない場合だけ、公開 model word API で残ったsuffixも含む単語全体をfallback rangeにする。
明示range/insert-replace、insertText、FQN、additional imports、snippet と cancellation/version guard は変更しない。

既存 popup の判定は `.suggest-widget` と可視box/styleを使う、CDN0.55.1に依存するDOM互換処理である。
getDomNodeが公開でも、selectorやwidget状態自体がtypedなMonaco公開契約とは扱わない。key event前とedit後に確認し、既に開いた候補の選択・resolveを再開始しない。
完全な候補集合はMonacoが再filterして使えるため、文字入力ごとに新しいRPCが必ず必要とはしない。公開eventと実CDNの選択FQN・確定全文・PHP bindingで重複要求と選択保持を検証する。

54件のreviewには属性付きclassのPHPDoc markerを含む必須2件がある。現be1 batchでのmarker欠落は別のruntime回帰として未達であり、追加の字句・range診断の成功でその契約を成功扱いにしない。修正済みruntimeと資産は別のexact gateで取り込む。
