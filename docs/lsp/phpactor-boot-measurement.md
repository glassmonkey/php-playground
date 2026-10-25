# Phpactor per-request boot measurement

## Result

Measured on 2026-10-25 from the phpactor worker branch at starting HEAD
`a1ccd14856e4c5761fe55dd027c8a0ebf54f65c2`. This is a **Node-hosted WASM harness**, not a browser or Worker UI measurement. It uses the repository's PHP 8.5 WASM runtime, Phpactor `2026.10.07.0`, its prebuilt data asset, `/workspace`, and the same `php.run()` call shape as the adapter. The selected analysis version was also 8.5. The PHPactor PHAR SHA-256 is recorded in `assets/lsp/phpactor/manifest.json`.

| Measurement | Result |
| --- | ---: |
| `startPHP` through runtime and Phpactor data readiness | 65.3–81.7 ms; median 71.5 ms (JS `performance.now`) |
| First `php.run`, local-variable completion | 131.4–190.0 ms; median 145.9 ms (JS `performance.now`) |
| First-run autoload | 27.6–39.0 ms; median 30.1 ms (PHP `hrtime`) |
| First-run `Phpactor::boot` + container build | 22.8–27.9 ms; median 26.1 ms (PHP `hrtime`) |
| First-run `CompleteHandler::handle` | 15.3–36.6 ms; median 18.9 ms (PHP `hrtime`) |
| Warm profiled `php.run`, 24 fixture samples | 41.6–93.8 ms; median 54.9 ms (JS `performance.now`) |
| Warm autoload | 7.7–10.0 ms; median 8.3 ms (PHP `hrtime`) |
| Warm `Phpactor::boot` + container build | 9.9–25.0 ms; median 10.4 ms (PHP `hrtime`) |
| Warm completion handler | 6.7–25.2 ms; median 14.9 ms (PHP `hrtime`) |
| Warm adapter mapping | 0.002–0.116 ms; median 0.072 ms (PHP `hrtime`) |

The warm Phpactor boot/container aggregate is measurable; its median across the
24 fixture samples is 10.4 ms, while the handler median is 14.9 ms. Individual
samples varied, including one 25.0 ms boot sample. The first run has a separate
one-time Web SAPI initialization path in `PHP.run()`; the phase totals do not
cover all of `php.run()`. These clocks have different boundaries, so the JS
total is **not** reduced by summing or subtracting PHP `hrtime` intervals. Boot
is a recurring cost in this route, but this sample does not establish that boot
is the sole or largest warm latency contributor.

## Method and equivalence

Run from the repository root:

```sh
node scripts/lsp/phpactor/diagnostics/measure-boot.mjs
```

The script records asset byte lengths and hashes in its JSON output. It starts
one `startPHP('8.5', ..., 'WEB')` instance under Node, waits for its data asset,
then measures its first `php.run()` as cold and subsequent runs on that same
object as warm. The harness was run in four fresh Node processes, each giving a
separate cold-start sample. Every run handles a completion request, and the WASM C SAPI
performs request shutdown after each call. Six stock/profile comparisons cover
local variable, built-in function, same-file function, same-file class,
instance-member, and static-member completion. There were 67 `php.run()` calls
in total per process: one cold profiled call, six stock calls, six
unprofiled-wrapper equivalence calls, six additional profiled fixture calls,
and 24 alternating observer-overhead pairs (48 calls). That is 67
`php.run()` calls per process and 268 across the four measurement runs.

The measurement-only `dispatch-profile.php` mirrors
`src/lsp/phpactor/dispatch.php`. For the six completion cases, its unprofiled
response body matched the stock dispatch body byte-for-byte; all exit codes
were zero. The measured PHP phases use only `hrtime(true)`:

* `autoload`: the `require` for `/phpactor/vendor/autoload.php`.
* `request_decode`: reading and decoding the request JSON.
* `phpactor_boot_container_build`: one aggregate around `Phpactor::boot()`.
  That method constructs `PhpactorContainer`, configures and loads extensions,
  boots bootable extensions, and calls `Container::build`; the timer does not
  split those operations.
* `completion_handler`: `CompleteHandler::handle()` only.
* `adapter_mapping`: conversion of Phpactor suggestions to the adapter's LSP
  completion-item shape.
* `response_encode`: encoding the response JSON.

The JS `performance.now()` clock wraps only `php.run()`. Initialization is
measured separately from before `startPHP()` until the Phpactor data loader has
finished. The observer comparison alternated four profiled and unprofiled
wrapper pairs per fixture. Across four Node processes, per-fixture paired
median deltas ranged from -2.03 ms to +10.66 ms, including negative values.
This variance does not support a reliable scalar correction; treat observer
effect as unquantified beyond this noisy bound. PHP phase numbers include timer
calls; no correction was applied. Stock-response equality is checked
separately from observer overhead.

## Why each request boots Phpactor

The adapter's `requestPhpactor()` writes one request file and calls
`php.run({ code: "include '/phpactor-dispatch.php';" })` for each request
(`src/lsp/phpactor/phpactor-worker.ts:277-315`). The dispatch script requires
the PHAR autoloader, creates the per-request console input, calls
`Phpactor::boot()`, and invokes the completion/signature/hover handler
(`src/lsp/phpactor/dispatch.php:5-24,28-75`). The wrapper retains that behavior;
the container timer is placed around the same boot call.

The `PHP` JS object and Emscripten module do survive between calls to `run()`:
the Web SAPI initialization is guarded by `#webSapiInitialized`
(`src/php-wasm/php.ts:427-452`). But the C request path calls
`php_request_shutdown()` and resets its server context for each request
(`src/wasm/build-assets/php_wasm.c:965-987,995-1054`). The existing adapter
does not retain a Phpactor container in its JS object; it creates one inside
the included PHP dispatch on every call. This explains why the current route
repeats boot while keeping the WASM runtime alive. Whether a container could
safely survive PHP request shutdown, or whether a reduced/light boot could
retain the required services, was not tested here.

The fixed extracted Phpactor source used to check the boot path was
`/private/tmp/phpactor-extracted/lib/Phpactor.php`, version `2026.10.07.0`:
`Phpactor::boot()` is declared at line 97, creates `PhpactorContainer` at line
280, configures/loads/boots extensions at lines 286-337, and builds/returns the
container at line 356. The source tree is an extraction of the manifest-pinned
PHAR; the PHAR version/hash in the repository manifest is the reproducible
identity. No source-level or runtime experiment attempted to bypass this boot
path.

## Limits

* `startPHP(..., 'WEB')` under Node is a WASM-host measurement, not a real
  browser Worker measurement. It must not be mixed with the UI evaluation's
  browser timings.
* Cold is the first `php.run()` after WASM and data readiness, not download or
  browser page cold-start. Warm means the same Emscripten object is retained;
  it does not mean a persistent PHP request or Phpactor container.
* `Phpactor::boot()` and container construction/build are reported together.
  The completion handler and adapter mapping are separately observable in this
  mirror. Autoload, JSON phases, PHP runtime internals, SAPI setup, and JS/PHP
  crossing are not all decomposed into a single common clock.
* Four fresh process starts with six fixture samples and four overhead pairs
  per fixture per process are a diagnostic snapshot, not a stable performance
  benchmark. No browser result,
  persistent-request prototype, retained-container experiment, or light-boot
  experiment was run.

## Source references

* Adapter per-request write and `php.run()`: `src/lsp/phpactor/phpactor-worker.ts:277-315`.
* Stock dispatch and handler calls: `src/lsp/phpactor/dispatch.php:5-83`.
* JS runtime reuse and first-run SAPI initialization: `src/php-wasm/php.ts:427-452`.
* WASM request shutdown: `src/wasm/build-assets/php_wasm.c:965-987,995-1054`.
* Phpactor boot/container sequence: extracted pinned source
  `/private/tmp/phpactor-extracted/lib/Phpactor.php:97,280-356`.
* Measurement harness and mirror: `scripts/lsp/phpactor/diagnostics/measure-boot.mjs`,
  `scripts/lsp/phpactor/diagnostics/dispatch-profile.php`.
