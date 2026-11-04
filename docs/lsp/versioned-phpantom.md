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

This reorganization keeps all 12 reviewed UI assets, the public manifest, and the
TypeScript registry unchanged. Installing different bytes for UI use requires a
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
`node e2e/run-phpantom-release.mjs` を実行する。production build を専用の
preview で開き、PHP 8.0・8.3・8.5 の26ケースと review の14ケースを確認する。
元の全12版101ケースは残してあり、この部分集合を全版の保証とは扱わない。
名前付き引数のケースは明示的な補完要求であり、通常の自然入力の証拠と区別する。

hover と signature は RPC の内容だけでなく、可視 widget の本文にも
引数名と版の境界が現れることを検証する。関数のケースでは自然入力から候補を選び、
resolve に送った FQN、表示された説明、確定文書、実 PHP の呼出し先を確認する。
resolve-only の import は制御した応答の fixture であり、実 engine がその形式を
自然に返すことを証明するものではない。

初期の固定 assets には user PHPDoc の欠落、別 symbol の説明の混入、
namespace 内で global 関数を選択した際の呼出し先の誤りが残っている。
新しい assertion はこれらを失敗として扱う。既知の制限や旧版と同じ結果という理由で
成功へ変換しない。runtime 修正と検証済み12版 batch の採用は別の受入 gate を通す。

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
