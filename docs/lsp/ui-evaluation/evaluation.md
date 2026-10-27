# GLA-115 両UIの一次批評

## 仕様・振る舞いの構造

現在のレビュー対象は[#421 PHPantom UI/Worker](https://github.com/glassmonkey/php-playground/pull/421)、[#424 Phpactor UI/Worker](https://github.com/glassmonkey/php-playground/pull/424)、[#425 比較・画面記録](https://github.com/glassmonkey/php-playground/pull/425)。#420/#422はmanagerが成果hashを照合してclose済みで、必要な履歴参照を除き現行成果はこの3本に集約する。以下は既存sourceと既存runから見える経路を層ごとに分けたもの。ここでいう`Loading`は、アプリ初回起動表示ではなく、**文字入力後に候補欄へ出るLoading**を指す。

### #424 singleflight前の構成（baseline head `9eafdcd`）

```mermaid
flowchart LR
  subgraph browser["Browser page / 初回表示"]
    Assets["HTML・JS/CSS・Monaco assets"]
    Monaco["Monaco editor"]
    UI["UI adapter / client"]
    Loading["Monaco native .suggest-widget .message: Loading..."]
    Assets --> Monaco
    Monaco <--> UI
    Monaco -.-> Loading
  end

  subgraph phantom["PHPantom 現試作"]
    PW["Web Worker"]
    PQueue["serial Promise queue"]
    WASM["WASM module + WASI runtime<br/>Worker内で初期化・再利用"]
    PServer["PHPantom LSP server<br/>lsp_handle"]
    PW --> PQueue --> WASM --> PServer
  end

  subgraph phpactor["Phpactor 現試作 adapter"]
    AW["Web Worker"]
    Runtime["PHP runtime + data<br/>Worker起動時に初期化"]
    Run["各php.run<br/>独立PHP request"]
    Dispatch["dispatch include + autoload"]
    Boot["Phpactor::boot<br/>config / extensions / container"]
    Handler["completion / hover / signature handler"]
    Shutdown["PHP request shutdown"]
    AW --> Runtime --> Run --> Dispatch --> Boot --> Handler --> Shutdown
  end

  UI -->|PHPantom RPC| PW
  PServer -->|LSP result| PW
  PW -->|response| UI
  UI -->|Phpactor RPC| AW
  Shutdown -->|LSP result| AW
  AW -->|response| UI
  UI -->|itemsをMonaco候補へ変換| Monaco
```

構成図とsequenceは#424 singleflight前のsource head `9eafdcd247ce33dc3b3f2be5f1b34a64747cee76`におけるadapter/Worker構成を示す。言語サーバ一般の必須設計ではない。Phpactorの各`php.run`内のautoload/boot/container再構築はこのadapterのrequest境界で発生し、Phpactor自体の必須要件ではない。Loading nodeは別source headでのp7一回観測であり、このbaseline以降の画面表示条件を示すものではない。初回ページasset・runtime準備とは別段階である。

### 入力後のrequest sequence

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant M as Monaco
  participant C as UI client
  participant W as Web Worker
  participant S as LSP server / PHP request

  U->>M: 文字入力 / hover / signature操作
  M->>C: provider request
  alt PHPantom 現試作
    C->>C: model / version / positionを記録
    C->>W: LSP requestをpostMessage
    W->>W: Promise queueで直列処理
    W->>S: resident WASI内のlsp_handle
    S-->>W: LSP result
    W-->>C: response
    C->>C: 現在modelとdocument versionを照合
    alt 同じ文書版
      C->>M: itemをMonaco候補へ変換
    else 文書版が変化
      C->>C: 古いresponseを破棄
    end
  else Phpactor 現試作 adapter
    opt baseline head `9eafdcd` の自動completion
      C->>C: 入力静止を100ms待つ（baseline source値）
      alt recoveryRetryではない
        C->>C: 先行completion requestのbarrierを待つ
      else recoveryRetry
        C->>C: 先行request barrierを迂回（baseline source）
      end
    end
    C->>W: requestをpostMessage
    W->>S: php.runでPHP request開始
    S->>S: dispatch / autoload / Phpactor boot / container
    par PHP requestの実行
      S->>S: completion / hover / signature handler
      S->>S: PHP request shutdown
      S-->>W: LSP result
      W-->>C: response
    and completion providerのcancel（発生した場合）
      M-->>C: CancellationToken
      C-->>M: UI側のprovider resultを破棄
      Note over W,S: cancelはWorker/PHP requestへ中断を伝えず、処理はshutdownまで続く
    end
    C->>C: token・現在model・document versionを照合
    alt 有効な最新文書
      C->>M: itemをMonaco候補へ変換
    else cancel済み / 古い文書版
      C->>C: resultを破棄
      opt 自動completionで文書が進んでいる
        C->>C: 最新版を再要求
      end
    end
  end
```

baseline head `9eafdcd`の自動completionにあった100ms静止待ち・先行request barrier・文書版照合とretryはPhpactor UI/client実装で、language server固有仕様ではない。後続head `388cbe6`ではlatest-only singleflightを独立確認した。slow試行では古い応答後に最新要求が出てraw 19件/画面12行、fast試行では1要求で同じ19/12件だった。詳細は[after-check記録](evidence/after-singleflight-2026-10-26T03-14Z/README.md)。hover/signatureもPhpactor側では同じ`php.run`のPHP request境界を通るが、自動completion専用の待ち・集約を他requestへ一般化しない。UI側token cancellationは、実行中Worker/PHP処理への中断命令を意味しない。

| 層 | PHPantom（#421） | Phpactor（#424） | 差の主な所在・根拠の境界 |
|---|---|---|---|
| 初回起動 | WorkerがPHPantom WASM runtimeを読み込み、同じWorker内で再利用する。 | WorkerがPHP runtimeとdataを起動時に準備し、JS runtimeを再利用する。各`php.run`は独立requestとして終了する。 | runtime/adapter構成の実装差。browser初回asset/runtimeの統一計測はない。p4のNode-hosted `startPHP`→runtime/data readinessは中央値71.5msで、browser起動比較には使わない。 |
| 入力ごとの処理 | requestをPHPantomの`lsp_handle`へ渡し、PHPantomがraw completion itemsを返す。 | `php.run`ごとにdispatchをincludeし、`Phpactor::boot()`とconfig/extensions/container構築後にhandlerを呼び、request終了する。 | raw items・metadataは各language serverの結果。Phpactorの毎回bootは現adapterの経路で、Phpactor必須制約ではない。bootのRTT寄与は未分離。 |
| 要求queue・cancel | Worker内にPromise queueがあり、clientはrequest時のmodel/versionとresponse時の状態を照合して古い結果を破棄する。 | baseline `9eafdcd`: 100ms settle、通常自動completionのin-flight barrier、CancellationToken、最新versionへのretry。after head `388cbe6`: automatic latest-only singleflightを確認。 | queue/cancel/retryはadapter/UIとWorker連携の実装差。baselineの4 request/3 obsolete/Loading約7.08秒は[#424 Loading診断](https://github.com/glassmonkey/php-playground/blob/9eafdcd247ce33dc3b3f2be5f1b34a64747cee76/docs/lsp/phpactor-preview/evidence/completion-loading-2026-10-26.md)。afterの別pace runは[独立追試](evidence/after-singleflight-2026-10-26T03-14Z/README.md)を参照。 |
| Monaco表示 | LSP itemをMonaco suggestionへ変換し、range/insertText等を用いて表示する。raw item数とvisible row数が異なる場合がある。 | 同じくLSP itemをMonaco suggestionへ変換する。過去の`new Gre`ではraw `items: []`でも画面に5行あり、Completion OFFでも同じ表示を観測。Monaco word suggestion由来を支持するがprovider IDは未特定。 | 表示filter/変換と候補欄LoadingはUI/editor側。画面行をraw language-server候補として数えない。 |

この切り分けでは、**候補内容・metadataの差**と**起動/要求経路・queue/cancel・Loading・Monaco表示の差**を混ぜない。既存sourceは構造の根拠、trace/screenshotはそのrunでの振る舞いの根拠。実測していない段階時間やLoading内部状態は未確定のまま扱う。採用判断は付けない。

### #424受領済みLoading観測とruntime根拠

[#424 Loading診断](https://github.com/glassmonkey/php-playground/blob/9eafdcd247ce33dc3b3f2be5f1b34a64747cee76/docs/lsp/phpactor-preview/evidence/completion-loading-2026-10-26.md)は当時の#424 docs head `9eafdcd247ce33dc3b3f2be5f1b34a64747cee76`に保存された、source head `e4f36cb8d1544369712ecbbf2a17e704b0a0a633`での隔離browser 1 run。自然`str_`は160ms/keyのnominal pauseを指定したが、agent-browser CLI overhead込みの観測provider間隔は354–458msで、160ms/文字benchmarkではない。4 requestのうち先行3件はUI providerがcancelされた後もWorker/PHP側で継続した。自動`recoveryRetry`はin-flight completion barrierを迂回し、古い処理も並行して続いた。Monaco native `.suggest-widget .message`の`Loading...`は初回request送信後に出現し、観測中の合計約7.45秒表示された。最終requestはresponseまで6.806秒、raw 19 itemsを返し、最新versionで採用後に画面12行となった。provider invocation後のLoadingは最新responseが採用されるまで続いた。

このrunはcandidate不足ではなく、入力中の複数dispatch・cancelしても継続するWorker処理・最新request応答待ちを含むadapter/UI経路でLoadingが長く続いた事実を示す。Phpactor serverや`Phpactor::boot()`単独を全遅延の原因とはしない。p4の[#424 boot計測報告](https://github.com/glassmonkey/php-playground/blob/9eafdcd247ce33dc3b3f2be5f1b34a64747cee76/docs/lsp/phpactor-boot-measurement.md)、[計測runner](https://github.com/glassmonkey/php-playground/blob/9eafdcd247ce33dc3b3f2be5f1b34a64747cee76/scripts/lsp/phpactor/diagnostics/measure-boot.mjs)、[dispatch profiler](https://github.com/glassmonkey/php-playground/blob/9eafdcd247ce33dc3b3f2be5f1b34a64747/scripts/lsp/phpactor/diagnostics/dispatch-profile.php)はruntime/virtualFSとPhpactor dataをWorker起動時に準備し、JS PHP object/Emscripten moduleを再利用する一方、各`php.run`はPHP request shutdownを経てdispatchを再includeし、autoload・`Phpactor::boot()`・container構築を繰り返すと整理している。Node-hosted `startPHP`→runtime/data readinessの中央値71.5msも同docに記録されたが、browser page asset loadやWorker初期化は含まず同条件の比較には使えない。container保持の常駐化は単純な設定変更ではなくruntime/dispatch境界の変更を要し、light bootとは別案。どちらも未実装・未検証である。warm boot+container中央値10.4msのNode-hosted WASM実測は開始source head `a1ccd14856e4c5761fe55dd027c8a0ebf54f65c2`における別計測であり、browser WorkerのLoadingやrequest RTTへ転用できず、全体遅延への寄与も特定しない。

manager承認のlatest-only singleflightは#424 head `388cbe69654113a00a2272cc9e9b2e2a46c5c55`で実装され、独立after-checkではslow `str_` 2 runで各2 RPC（中間版への要求なし、最新raw 19→12行）、fast 1 runで1 RPC（raw 19→12行）だった。baseline agent-browser 1 runは4 RPC/3 obsolete、最新応答まで6.69秒、Loading約7.08秒。afterの独立slowは最終入力から最新候補応答まで3.127秒/2.934秒、fastは507msだった。pace・run数が一致しないため速度改善率は出せない。afterでLoadingの厳密な開始/終了は未計測。OFF時はworker close後に応答が観測されず、製品内部のstale-response guardは未検証。runtime/handlerの一件待ちを含む現scopeの検証は終了し、追加測定はしていない。詳細と証拠は[after-check記録](evidence/after-singleflight-2026-10-26T03-14Z/README.md)。

## 対象と方法

PHP 7.4/8.5 builtin completionの失敗baselineと修正版追試は[version-filter評価記録](phpantom-74-85/expectations-and-method.md)から参照できる。最新のv3 browser retestは#421 head `d92b99f04d9d0cb7b6410bc52a668807d2ccc4a8`で、`strlen`/`array_fill` UI resolve後の7.4 negativeと8.5 positiveを別Worker・別版で確認した。詳細、Worker trace、実fetch asset hash、画面証拠は[独立v3追試](phpantom-74-85/browser-2026-10-27-cache-filter-v3.md)。過去headの失敗証拠は上書きしていない。

2026-10-25に、PHP 8.5をUI上で確認して測定した。対象headはPHPantom `863c1337adb05a339dbbd6eb20a9c26eb7b63316` とPhpactor `ee48f4733c802fa39fc3abd54441dd9737017ee8`。両source worktreeは測定時点でclean、対象Viteはそれぞれ7260/3471で稼働していた。隔離Playwright BrowserContext、Chrome `156.0.8078.47`、viewport 1440×1000を使用し、既存の利用者プロファイルには触れていない。

同期runはPHPantom [trace](evidence/phpantom-2026-10-25T12-30-40-981Z/trace.json)、Phpactor [最終trace](evidence/phpactor-2026-10-25T12-38-22-832Z/trace.json)。共通コードは[fixture.php](fixture.php)。各手動候補ケースは全文と`didChange` versionを確認後、カーソル末尾のpositionにCtrl+Spaceを2回送り、対応するWorker responseをrequest idで対応付けた。r1は各ケースの初回request、r2は同じ全文/versionでの再request。ページ起動・初期化待ちの時間は含めない。旧fixtureは[fixture-v1.php](fixture-v1.php)に保存した。

以前の同期漏れrunは`evidence/unsynced-20261025/`に保持しているが、今回の候補比較には使わない。Phpactorの初回PHP 8.2 runもPHP 8.5比較から除外した。Completion OFF診断は原条件と別条件であり、[PHPantom](evidence/phpantom-word-suggestions-2026-10-25T12-25-57-915Z/trace.json)と[Phpactor](evidence/phpactor-word-suggestions-2026-10-25T12-25-32-069Z/trace.json)に記録した。

## 同じ入力での観測

| 入力・操作 | PHPantom raw応答 → 画面 | Phpactor raw応答 → 画面 | 解釈・差の根拠 |
|---|---|---|---|
| `strl` + Ctrl+Space | 4件（`strlen`, `mb_strlen`, `iconv_strlen`, `grapheme_strlen`）→ 4行 | 6件（`strlen`と一般keyword 5件）→ 1行（`strlen`） | raw数と表示数は同じでない。Phpactorのkeywordはprefix filter後に非表示。両方で`strlen`詳細/引数snippetを表示。 |
| `$gre` + Ctrl+Space | `$greeter`, `$greeting` → 2行 | 同じ2件 → 2行 | local variable候補は両方で確認。Phpactorはdetailに推論型（`Greeter`/`string`）を表示、PHPantomは両方`variable`。 |
| `$greeter->` + Ctrl+Space | `message`, `create()`, `greet()` → 3行 | 同じ3項目 → 3行 | fixtureの型推論とinstance member候補を両方で確認。Phpactor detailは可視性・signatureをより明記。 |
| `Greeter::` + Ctrl+Space | `class`（`class-string`）と`create()` → 2行 | raw `class`（`insertText=class`, `detail=Greeter`, kind 21）とstatic `create()` → 2行 | 現fixtureにはstatic `create(): self`を定義。Phpactorの`class`は`::class`疑似定数であり、static methodではない。行表示の`class / Greeter`はraw label/detail。旧fixtureにstatic methodがなかったrunをstatic補完根拠にしない。 |
| `new Gre` + Ctrl+Space | raw 5件 → 画面2行（`Greeter`, `IntlGregorianCalendar`） | raw `items: []` → 画面5行（`Greeter`, `greet`, `greetUser`, `$greeter`, `$greeting`） | PHPantomはWorker候補のうち画面に2件。Phpactorの画面5行はCompletion OFFでも同じ5行、JSON-RPC 0件で再現。Monaco word suggestions由来を強く支持するがexact provider IDは未確認。5行をPhpactor LSP候補とは数えない。 |
| `greetUser(` / `strlen(` + Ctrl+Space | named argument 1件ずつ表示 | local変数とnamed parameterの2件を表示 | これはcompletion候補でありsignature helpではない。Phpactorでは同位置でも既存変数`$greeting`が混ざった。 |

### `str_`と`strl`の手動/自動追試

追加の同一fixture追試で`str_`を貼り付けてCtrl+Space、また`str`から`_`を自然入力する操作を分けた。両方の自動入力でversion一致の`textDocument/completion` requestとresponseがあり、この制御条件では`str_`候補が非表示になる現象を再現しなかった。ユーザー実試用時の入力履歴やfocusが異なれば結果は別になり得る。

| 入力 | PHPantom manual / auto | Phpactor manual / auto |
|---|---|---|
| `str_` | raw 32 / 32 → visible 13 / 13。例: `str_contains`, `str_starts_with`, `str_replace` | raw 19 / 19 → visible 12 / 12。rawには`class`, `enum`, `trait`, `function`, `interface`も含むが画面には出ない。 |
| `strl` | raw 4 / 4 → visible 4 / 4 | raw 6 / 6 → visible 1 / 1（`strlen`。5 keyword itemsは非表示） |

同じtraceの手動/自動順にrequest ID・文書version・line 7 / character 4を保存した。[PHPantom trace](evidence/phpantom-str-prefix-2026-10-25T13-35-08-284Z/trace.json)、[Phpactor trace](evidence/phpactor-str-prefix-2026-10-25T13-35-19-537Z/trace.json)。PHPantomでは`str_`の自動raw itemに`str_contains($haystack, $needle)`等のsignature labelがある一方、手動raw labelは関数名のみの候補が含まれた。画面も自動側ではdetailが見える項目があり、同じ候補集合でもmetadata/表示詳細に差があった。原因は未確定。

### Worker RTT

単位ms。各値は手動completionのrequest postMessageから対応response受信までで、候補の意味・画面反映・人の入力待ちは含まない。各2回のみで統計的な代表値ではない。

| ケース | PHPantom r1 / r2 | Phpactor r1 / r2 |
|---|---:|---:|
| `strl` | 29.2 / 5.3 | 347.4 / 237.6 |
| `$gre` | 13.5 / 3.8 | 224.5 / 162.2 |
| `$greeter->` | 24.8 / 8.7 | 227.7 / 218.0 |
| `Greeter::` | 1.5 / 5.1 | 199.3 / 214.8 |
| `new Gre` | 106.6 / 14.5 | 137.9 / 154.5 |
| `greetUser(` | 4.2 / 5.7 | 156.5 / 177.4 |
| `strlen(` | 8.6 / 3.1 | 185.2 / 197.4 |

このboundaryではPHPantomの応答が今回の全ケースで短かった。Phpactorの初期化request RTTは446.4ms、PHPantomは359.0msだった。値はこのhead・fixture・worker内の観測であり、Phpactor起動/boot時間単独の測定や一般性能値ではない。`new Gre`は返却内容も異なるので、同一仕事量の速度比較とみなさない。

別境界として、Ctrl+Space requestからDOM上の候補rowを確認した時刻までの観測値もtraceにある（ms、r1/r2）。これはWorker RTTにUI処理を足した厳密なpaint時刻ではなく、response後にrunnerがrowを検査した時刻までを含む。

| ケース | PHPantom r1 / r2 | Phpactor r1 / r2 |
|---|---:|---:|
| `strl` | 93.8 / 35.1 | 619.8 / 366.3 |
| `$gre` | 67.1 / 67.6 | 441.8 / 187.5 |
| `$greeter->` | 67.4 / 40.8 | 253.0 / 258.5 |
| `Greeter::` | 60.0 / 48.3 | 224.9 / 249.6 |
| `new Gre` | 177.3 / 91.0 | 163.9 / 239.1 |
| `greetUser(` | 59.3 / 63.5 | 218.0 / 399.4 |
| `strlen(` | 118.9 / 93.2 | 214.6 / 231.9 |

## 自動入力と画面までの体験

手動Ctrl+Spaceと実際のキー入力を分けた。PHPantomは`->`、`::`、`strl`入力後に候補表示を確認し、Worker RTTは3.3、3.4、4.2ms。修正後Phpactor runでは`->`、`::`、`strl`がすべて表示され、RTTは192.1、199.0、152.1ms。`->`の明示Ctrl+Spaceは別scenarioで227.7/218.0msだった。

旧Phpactor run `12-31-07-559Z`の`->`欠測境界も確認した。[旧スクリーンショット](evidence/phpactor-2026-10-25T12-31-07-559Z/typed-arrow-trigger.png)には全文でなく`->`だけがeditor先頭行に表示されていた。traceではpaste後の全文version 13に続き、version 14の`-`、version 15の`->`というchangeがあり、completion request id 30は`line 0, character 2`、responseは空itemsだった。期待した`line 8, character 10`ではない。したがってこの空応答をbackend候補なしと扱わない。画面はPHP 8.5、Completion checkedで、traceのpage errorは空。旧runはactive DOM focus / selected textを記録しておらず、その値は確定できないが、request positionと画像はcaretが先頭にあったことを示す。原因は貼り付け後に選択が残り、続くキーが全文を置換した入力ハーネス側の問題と考えられる。

runnerはpaste後に`Control+End`で末尾へ移動するよう修正した。修正後run [trace](evidence/phpactor-2026-10-25T12-38-22-832Z/trace.json)では、`->`入力の全文を画面editorで確認し、document version 16の変更後、requestは`line 8, character 10`、対応responseまで192.1ms、表示候補は`create`, `greet`, `message`。キー操作開始→request 202.7ms。active elementはMonaco `native-edit-context` / “Editor content”、PHP 8.5、Completion checked、page errorなし。Ctrl+Spaceの`$greeter->` 2回は自然入力とは別scenarioに記録した。この訂正は評価runnerだけで、UI/Worker実装は変更していない。

修正runnerの自然入力時刻（入力操作→request、request→response）はPHPantomが`->` 94.7+3.3ms、`::` 95.6+3.4ms、`strl` 16.4+4.2ms。Phpactorは`->` 202.7+192.1ms、`::` 199.4+203.2ms、`strl` 19.7+152.1ms。キー時刻は入力操作直前、request/responseはWorker postMessage観測。この単発runはresponse後にrowを確認するまでで、初回DOM表示は次節で別計測した。

Phpactor UI sourceには自動trigger前の100ms settle、request cancellation、completion barrierがある。下の遅延応答追試では、1.4秒保留した旧候補を文書変更後にUIへ解放したが、新しい`greet`行は維持された。連続typing中の全応答順序や settle の見た目への寄与までは測っていない。最新Phpactor runではsignature相関が有効になったlocal signature responseはnull/tooltipなし、builtin signatureはresponse/tooltipあり。

別の有効な8.5 runでは、Phpactor builtin `strlen(`のsignature help tooltipが表示され、local `greetUser(`はresponse `null`・tooltipなしだった。PHPantomでは両方tooltipが表示され、local signatureは`(string $name = 'Guest'): string`、builtinは`(string $string): int<0, max>`。

同じ8.5 fixtureの`$greeter`でpointer hoverとMac Monaco shortcut `Meta+K`, `Meta+I`を別々に実行した。両方ともrequestはline 5 / character 3。PHPantomはWorker応答8.5/8.9ms、tooltipは`<?php $greeter = Greeter`を含むcode block。Phpactorは114.6/57.6ms、Worker `contents=Greeter`、tooltip text `Greeter`。request→最初の`.monaco-hover`可視DOM mutationはPHPantom 148.3/2.4ms、Phpactor 46.4/3.4ms（pointer/keyboard順）。両方法ともDOM上`.monaco-hover`を確認し、page/console errorなし。結果はPHPantom [hover trace](evidence/phpantom-hover-2026-10-25T13-17-33-198Z/trace.json)とPhpactor [hover trace](evidence/phpactor-hover-2026-10-25T13-17-20-597Z/trace.json)。先行runnerのPhpactor `visible=false`はtooltip非表示を示す証拠ではなく、pointer位置で撮った画像にはtooltipが写り、改良計測でpointer/keyboardとも表示を確認した。旧判定を訂正する。mutation値はpaint時刻ではない。

## 挿入・操作・設定

両UIで`strl`候補をEnter選択すると`strlen($string)`がprefixを置換し、snippetの引数箇所へ移動した。Tabでplaceholderを抜けた後`;`を入力できた。`$gre`から`$greeter`を選んでも`$$greeter`にはならなかった。PHPantomは同じ候補行で`strlen($string)`と`int<0, max>`を見せ、Phpactorは`strlen`とsignature detailを表示した。結果画像は各同期runの`builtin-strl-insert.png`, `builtin-strl-tab.png`, `local-variable-insert.png`。

Completion checkboxをOFFにするとWorkerが終了し、ONで再初期化することを両方で確認。PHPantomはPHP 8.4選択時に「PHP 8.5を使用」とエラー表示し、8.5へ戻すと再初期化した。Phpactorは8.4が未検証という警告を表示し、8.5へ戻した。light/dark切替とCompletion checkbox/HTML Previewの画面上の並びを確認した。keyboard/focusの網羅的なアクセシビリティ評価はしていない。

## PHPantom 7.4 / 8.5 言語差分追試

新scopeではPHPantom採用前提で、言語version適用、builtins/signature、構文、diagnostics、版切替後のstale状態を調べる。現行測定済みhead `863c1337adb05a339dbbd6eb20a9c26eb7b63316`のtraceでは、PHPantom WASI 0.11.1が`initializationOptions.phpVersion=8.4`を`-32602`で拒否し、PHP 8.5 defaultを継続した。これは既存buildの制約で、新buildの結果ではない。7.4の実適用もまだ検証されていない。trace: [PHPantom 8.5 baseline](evidence/phpantom-2026-10-25T12-30-40-981Z/trace.json)。

一次資料に基づく期待値、ケース別fixture、自然入力手順、parser受容/補完/diagnosticの区別、7.4→8.5→7.4 stale確認案は[PHPantom 7.4/8.5計画](phpantom-74-85/expectations-and-method.md)に整理した。feature probeはPHP 8.0 named arguments/nullsafe/match、8.1 enum/readonly properties、8.2 readonly class、8.3 typed class constants、8.4 property hooks、8.5 pipe operatorを分けた。versioned builtinsは`str_contains`、`array_is_list`、`json_validate`、`array_find`、`array_first/last`に加え、既存`array_map` stubの7.4/8.x引数variantと、7.4で非推奨・8.0で削除の`each()`を含めた。ブラウザ追試はmanagerがnew build/headをreadbackして渡すまで未実施。

## 追加追試: 遅延応答と初回DOM表示

応答遅延は隔離ページのWorker message capture listenerで注入した。指定methodのresponseをapp listenerへ渡す前に`stopImmediatePropagation()`で保留し、1.4秒後に同じdataのMessageEventを隔離ページ内でdispatchした。server、product Worker/sourceは変更していない。

- **入力変更後の旧completion:** 両方で`$greeter->`要求（line 7 / character 10）のresponseを1.4秒保留し、文書を`$greeter->g`へ変更してCtrl+Spaceを別requestとして実行。PHPantomは現在候補`greet()`、Phpactorは`greet`を表示。旧3-item responseを解放した後も現在候補1件が維持され、旧候補一覧に戻らなかった。[PHPantom trace](evidence/phpantom-delay-2026-10-25T13-21-21-192Z/trace.json)、[Phpactor trace](evidence/phpactor-delay-2026-10-25T13-20-55-536Z/trace.json)。2要求は別request ID / 文書versionとして記録。

OFF caseはhover応答を待つ間にcheckbox操作がWorkerをterminateした。隔離harnessは後から応答を再配送しなかったため、これは製品側のgeneration/version guardが古い応答を拒否した証拠ではない。観測できたのはWorker終了と配送なし、ON後の再initialize/didOpen、新しいhoverの成功まで。

初回表示計測は[Phpactor](evidence/phpactor-first-visible-2026-10-25T13-26-48-949Z/trace.json)と[PHPantom](evidence/phpantom-first-visible-2026-10-25T13-26-59-591Z/trace.json)で別々に実行。各アプリ/ケースはfresh BrowserContextを作り、同じ8.5 fixtureで`$greeter->`と`strl`を自然キー入力で各3回実施。r1はそのcontextの初completion request、r2/r3は同Worker内の反復。text/version/request position/response idは全有効runで一致。UIの「first DOM visible」はMutationObserver後の次animation frameに、widgetにrowがあり、rectが正、display/visibilityが有効、opacity>0となった最初のDOM/styleサンプル。physical paint完了までは保証しない。

各行の時刻は`Worker RTT / input→request / input→first DOM visible`（ms）。入力時刻はキー送信直前、RTTはWorker postMessage境界。全試行でWorker responseがDOM-visible sampleより先だった。

| UI / case | r1 first-after-init | r2 same-worker | r3 same-worker |
|---|---:|---:|---:|
| PHPantom `$greeter->` | 19.2 / 90.7 / 127.8 | 8.3 / 88.2 / 128.1 | 8.4 / 87.6 / 127.7 |
| Phpactor `$greeter->` | 201.7 / 192.8 / 413.8 | 90.2 / 189.2 / 297.5 | 84.2 / 188.4 / 280.0 |
| PHPantom `strl` | 9.7 / 15.5 / 44.1 | 2.3 / 13.7 / 45.2 | 2.1 / 14.1 / 45.9 |
| Phpactor `strl` | 182.7 / 17.5 / 213.9 | 86.6 / 14.8 / 110.9 | 71.3 / 15.9 / 89.9 |

`first-after-init` is first completion request after LSP initialize in a new context; it excludes browser/server cold start and is not a process-cold benchmark. Phpactor `->` has source-level 100ms settle before request, reflected in input→request values. These small samples compare these two heads/cases only; no statistical or product-wide performance inference follows.

## 修正後のPhpactor自然入力追試

ユーザーが「Ctrl+Spaceなしの候補表示」を必須条件にしたため、既存のPHPantom `863c1337adb05a339dbbd6eb20a9c26eb7b63316` / Phpactor `ee48f4733c802fa39fc3abd54441dd9737017ee8` 比較を維持し、修正後Phpactorだけを別runで確認した。manager READY通知とsource worktree `gla-115-lsp-phpactor-preview` のclean/headを照合したうえで、保持中の3471 serverへ隔離Chrome `156.0.8078.47` から接続した。UIはPHP 8.5、Completion ON、[fixture.php](fixture.php)。測定操作にCtrl+Spaceは使っていない。

| 自然入力 | 修正head raw response → 画面行 | 入力/応答の観測 |
|---|---|---|
| `s`→`str_`、160ms/文字 | 1.8秒時点: 最新requestなし/0行。さらに待つとlatest request 19→12 | 1.8秒停止時の[run 14-34 trace](evidence/phpactor-natural-after-fix-2026-10-25T14-34-22-926Z/str-underscore-slow-trace.json)では、version 3 / line 7 character 1への最初の`s` request id 2だけがあり、response未着、最新prefix要求なし、widget 0行。これはその時点の自動表示AC未達。別の長時間待機[run 14-35](evidence/phpactor-natural-after-fix-2026-10-25T14-35-23-888Z/str-underscore-slow-trace.json)ではその応答が3.611秒後に168 itemsを返すが、model version 6に変わっていたためsource traceは`document-version-changed-at-response`として破棄。100ms後に自動retryし、version 6 / line 7 character 4でid 3を要求、403ms後に19 items、DOM上12行を表示。input開始→latest request 3.930秒、→DOM visible 4.346秒。遅延後に回復する観測は1.8秒条件の未達を打ち消さない。 |
| `s`→`str_`、10ms/文字 | 19→12 | version 6 / line 7 character 4の要求1件。Worker RTT 502ms、input開始→request 145ms、→DOM visible 666ms。 |
| `strl`、80ms/文字 | 6→1 (`strlen`) | version 6 / line 7 character 4。Worker RTT 169ms。 |
| `$gre`、80ms/文字 | 2→2 (`$greeter`, `$greeting`) | version 6 / line 7 character 4。Worker RTT 165ms。 |
| `$greeter->`、80ms/文字 | 3→3 (`create`, `greet`, `message`) | version 12 / line 7 character 10。Worker RTT 178ms。 |
| `Greeter::`、80ms/文字 | 2→2 (`class`, `create`) | version 11 / line 7 character 9。Worker RTT 180ms。 |

### 一次選定で見る差と対応負担

- **候補本体/adapterの切り分け:** `str_`最新prefixのPhpactor raw responseは19 itemsあり、そのうち12行が表示された。1.8秒時点で表示がない旧runは、最新prefix要求が候補0件を返したのではなく、途中の`s`要求だけが送られ未応答の状態。旧長時間runでは`s`への168 item応答をversion不一致で破棄し、最新の`str_`を再要求した。後日の[#424 Loading診断](https://github.com/glassmonkey/php-playground/blob/9eafdcd247ce33dc3b3f2be5f1b34a64747cee76/docs/lsp/phpactor-preview/evidence/completion-loading-2026-10-26.md)では別head/別runでraw 19 itemsから12行が採用された。複数dispatchとcancel後も続くWorker応答を含むUI/adapter経路でLoadingが続いたが、Phpactor serverやboot単独を全遅延の原因とは断定できない。
- **追加対応負担:** 自然入力で遅い要求を捨てた後に最新versionを再要求する機構は入っているが、160ms/文字条件では最終表示まで約4.35秒だった。1.8秒以内の表示をACとする場合、現修正headは未達。候補ranking調整の根拠はなく、入力trigger/settle・cancellation・in-flight queue/retry・遅延表示を対象に追加調整とブラウザ回帰確認が必要になる。修正範囲や作業量はまだ見積もっていない。
- **未解決:** 10ms/160ms各1回のため、入力速度境界、Worker初回/反復負荷、複数連続responseやCPU競合時の表示時間は不明。DOM visibleはphysical paintを保証しない。PHPantom新headとの再比較も行っていない。どのlatency budgetを採るかはユーザー判断。

### 旧自然入力測定時のsource状態

実ブラウザ測定時のPhpactor source headは`4fd516045ee6aa958bb01c78be5cb76205537894`でclean、asset `/src/lsp/client.ts`のhashも上記traceに保存した。その後の報告時read-only確認ではbranch `gla-115-lsp-phpactor-preview` のHEADは同じだが、`src/editor.tsx`, `src/lsp/client.ts`, `src/lsp/__test__/client.spec.ts`に未commit変更、`docs/lsp/phpactor-preview/evidence/completion-quick-suggest-v8/`に未追跡証跡があった。このdirty状態のコードは今回のブラウザ評価対象ではなく、追加測定していない。PHPantom worktreeは`863c1337adb05a339dbbd6eb20a9c26eb7b63316`でclean。

low/fast `str_`結果とsource traceは[run 14-35](evidence/phpactor-natural-after-fix-2026-10-25T14-35-23-888Z/trace.json)。各case traceには全`didChange` version、completion request/response id、cursor rect、スクリーンショット、ロードscript/styleのURL/status/ETag/SHA-256を保存した。特にロードされた`/src/lsp/client.ts`はSHA-256 `dac9df3998920ccfc6ac62de3bbd781851477b7ec1a8a3ed55c07d4671e92e77`。今後の修正head再測定では、harnessが入力停止1.8秒時点と、最終request/response後の状態を別々に記録する。candidate visibleはMutationObserver後のanimation frameでwidget rowとrect/styleを確認したDOM計測であり、physical paint完了の保証ではない。ページ/console errorはなかった。

修正headのPhpactor内部traceではslow `str_`の旧応答を返却後、version不一致として破棄し、最新versionへのretryを起動していた。fast `str_`では入力中にmodel versionが進み、settle後にfinal versionを使う1 requestとなった。

### Completion / PHP version state遷移

[state transition run 14-33](evidence/phpactor-natural-state-after-fix-2026-10-25T14-33-05-103Z/completion-off-no-retry-trace.json) と [PHP version run](evidence/phpactor-natural-state-after-fix-2026-10-25T14-33-05-103Z/version-84-no-retry-85-recovery-trace.json)で別BrowserContextを使い確認した。

- `s`へのcompletion requestのWorker responseを隔離harnessで保留し、Completion OFFを操作。Worker terminationと、OFF後1.4秒間にcompletion request/didChangeが0件、widget非表示を記録した。応答はWorker終了後にharnessが再配送せずdropしたため、製品のresponse guardを検証した結果としては扱わない。ON後、editorへ戻って自然に`tr_`を入力すると、version 6 / line 7 character 4の新要求でraw 19 items、画面12行が出た。
- `str_`を表示後にPHP 8.4へ変更すると候補widgetが消え、その後1.5秒間completion requestは0件。PHP 8.5へ戻して同じfixtureへ自然入力すると、version 11 / line 7 character 4でraw 19 items、画面12行が出た。

上記Node/Playwright runnerとそのtraceは従来測定の履歴として保持し、今回のafter追試には使っていない。singleflight後のagent-browser操作、観測境界、slow/fast入力の限界は[after-check記録](evidence/after-singleflight-2026-10-26T03-14Z/README.md)に記録した。追試は完了し、現在のscopeで追加測定は行わない。

これらのPhpactor修正後結果は元の両UI比較表の値へ混ぜない。このsingleflight追試時点ではPHPantomの新head再測定はなく、Phpactor修正headの個別UI確認だった。後日のPHPantom version checkは別節に分け、修正後の対比較とは扱わない。一次報告の候補比較と同じく採用判断は付けない。

## PHPantom PHP 7.4 / 8.5 version-filtering browser check — baseline head 9579644

#421の新head `95796444b1ea3d7f158f15f378a644e300c67d6c` をagent-browser隔離sessionで確認した。UI選択7.4/8.5/7.4それぞれに対応するPHPantom initialize/serverInfoとdocument再openを観測したが、7.4へ戻した後も自然入力`str_c`のraw/UI結果に8.0+ `str_contains`が残り、候補名を本文に含めない同一`<?php\n$x = ` + 自然`array_f`では7.4 raw/UIに8.5追加の`array_first`が出た。8.5 positive controlを挟み7.4で再現しており、空画面・未要求・word-based補助候補では説明できない。**このbuildのversion-aware completionは確認した範囲で未達**。case相関、trace、既知の未測定は[PHPantom version browser記録](phpantom-74-85/browser-2026-10-27-new-build.md)を参照。構文解析とdiagnosticsはこの追試では未評価であり、別々に残す。

## PHPantom PHP 7.4 / 8.5 version-filtering browser check — post-fix head 91639e31

#421 head `91639e31fda5ffeb63d6ec6cf81f5da9dc39f7b3` を別の隔離agent-browser sessionで確認した。CDPのWorker-target診断で、アプリWorker自身がfetchしたWASM responseのcloneを読み取り、bytes/hashを照合した（18,518,682 bytes、SHA-256 `ec6238fb1be525f2963cbfb0c59b0e6489ba44a1c0462b3f84b481ebe03afc34`、manager配信値と一致）。この一時計測は起動時間比較に使っていない。新headでは7.4の自然`array_f` raw/UI結果から`array_first`、`array_find`、`array_find_key`が消え、8.5で同候補が出た後の7.4でも消えた。一方、自然`array_l`では8.5-only `array_last`が7.4の初回と8.5→7.4復帰後のraw/UIに残る。`str_contains`は初回7.4 Workerでraw/UIに残り、復帰後Workerでは除外された。従ってversion filterは確認した3関数には効くが網羅ではなく、他の2ケースはWorker lifecycle間で不一致があった。詳細なmodel version/cursor、matching request/response、raw/UI行、WASM hash取得法、無効run除外は[head 91639記録](phpantom-74-85/browser-2026-10-27-head-91639.md)と[Worker trace](phpantom-74-85/evidence/head-91639/worker-trace.json)に保存した。次回は[prepared cache-filter scenario](phpantom-74-85/next-run-cache-filter-scenario.md)に沿い、7.4で`strlen`・`array_fill`をUIからresolveした後にnegative casesを再確認する。これは準備手順であり、新build READY前の実測はしていない。`array_is_list`、`json_validate`、named arguments、構文解析とdiagnosticsは未測定。

## 差の原因と確度

| 要因 | 観測・source根拠 | 確度と限界 |
|---|---|---|
| 言語サーバの候補・metadata | 同期後のraw responseに候補数・detail・kind・snippetの違いがある。特に`new Gre`のPhpactor rawは空、PHPantom rawは5。Phpactorの`Greeter::`は`::class`とstatic `create`が別item。 | raw内容の事実は高。候補差がライブラリ固有かadapter/config/context由来かの帰属は未分離。 |
| 実行方式とrequest処理 | PHPantom Workerは持続WASI上で`lsp_handle`をqueue処理。Phpactor Workerはruntime/virtualFS/dataを再利用する一方、各`php.run`でPHP request shutdownを行い、dispatch/autoload/boot/containerを繰り返す。 | source構造は高。warm boot+container中央値10.4msはNode-hosted WASM上の別計測。browser RTT内の寄与や全遅延への比率は未分離。container保持にはruntime/dispatch変更、light bootは別の未検証案。 |
| UI/client timingと変換 | baseline `9eafdcd`では100ms settle、completion barrier/cancellation/retry。p7の1 runは4 request中3件がUI cancel後もWorkerで継続し、retryはbarrierを迂回。after `388cbe6`では独立slow各2 RPC、fast1 RPCで最新候補を表示。 | baselineのsource/trace事実は高だが単発。afterは小標本・pace不一致で改善率不明、slowは約2.9–3.1秒。`new Gre` 5行はMonaco由来が強いがprovider ID不明。React/Monaco frontend baselineも異なる。 |

遅延completion入力変更caseでは隔離ページが旧responseを同じidでapp listenerへ後から再配送した後も、現在文書の候補が維持された。source上、PHPantomはcompletion response後にrequested modelがcurrentかつversion不変か確認し、hoverも同様にmodel/versionを確認する。PhpactorはcompletionでCancellationTokenと`raceCompletionCancellation`を使い、キャンセル時はprovider候補を空で返すほかresponse後もmodel/versionを確認する。hoverもmodel/version確認を持つ。ここで確認した範囲には明示的なper-request generation counterは見当たらない。これはsource構造の記述であり、OFF/terminate時のruntime配送guardとは分ける。

Phpactor host CompleteHandlerの`new Gre`もraw空だったとの担当報告があり、ブラウザWorkerだけの障害という解釈は支持されない。担当からは該当completer source位置として`WorseClassMemberCompletor.php:124`が示された。初回host command exit 255はworkspace欠落で、temporary workspaceでは成功したとの回答であり、ブラウザ機能失敗には一般化しない。

## 再現手順と証拠

1. 各対象URLを開きPHP 8.5、HTML mode、Completion ONを画面で確認する。
2. [fixture.php](fixture.php)全文を貼り付け、`strl`, `$gre`, `$greeter->`, `Greeter::`, `new Gre`, `greetUser(`, `strlen(`をそれぞれ末尾に置く。
3. 手動候補比較はCtrl+Space。自動trigger比較は末尾に実キーで`->`, `::`, `l`を入力し、両操作の候補と時系列を混ぜない。
4. raw itemsはtrace内のrequest IDに一致するWorker response、画面行は同runの`*.png`で確認する。
5. `new Gre`のword suggestion診断だけは別contextでCompletion OFFの状態を保ち、Ctrl+Space後に行とJSON-RPC数を記録する。これは原条件の候補数に足さない。

traceには全postMessageとtimestamp、response、文書version、位置、raw items、表示行を保存した。無効な旧runも消さず、`unsynced-20261025`に根拠とともに残した。

## 未確認と小さな追加実験案

- 今回は入力変更後のold completionを一度ずつ解放して現候補が維持されることを観測した。さらに遅い/逆順の複数response列、PHP 8.4切替時の保留response、HTML Preview unmount等は未測定。Completion OFF後のhover responseは製品guardを通す試験になっていない。
- Word suggestion exact provider IDは未確認。Completion OFF時も同じ行/JSON-RPC 0で再現したためMonaco側由来は強く支持するが、provider内部IDの帰属はこの隔離測定からは分からない。
- Phpactorのlocal `greetUser(` signature helpは全文/version/positionが相関したresponse `null` とtooltipなしを確認した。これがserver feature limitかadapter/runtime差かは特定していない。
- 初期化やCPU競合を揃えた多数回の統計、各内部処理段階のbrowser時間、Worker queue待ちとbrowser RTTへのPhpactor boot寄与は未測定。Phpactor boot/containerの10.4ms中央値はNode-hosted WASM warm測定であり、browser Loading値に転用しない。各診断が少数runであるため性能一般や改善効果を推定しない。
- Completion OFFの診断からMonaco word providerまでは強く支持されるが、exact provider IDはinstrumentしていない。

この資料は候補比較、操作感、計測境界の判断材料であり、総合点・優勝者・採用判断を付けない。

### 確認できた範囲

両UIの隔離ブラウザ操作、同期後のraw completion responseと表示行、Worker RTTとDOM-visible時刻（各代表ケース3試行）、pointer/keyboard hover、遅延response後の候補維持とcheckbox再初期化、挿入/snippet、version/themeを確認した。source読みはruntime/UI差の根拠整理に用いた。

### 反省点

初期runではdocument change race、Phpactor version/caret誤認、hover event待ち漏れ、delay injectionのcase相関漏れ、first-visible反復の古いchange再利用があった。いずれも修正runを別保存し、無効な測定値は比較から除外した。無効runも原因説明用に保持した。

### 次に活かすこと

再測定では見た目だけでケースを対応付けず、全文/version/position/request IDを結ぶ。Worker RTTと入力から表示までの時間を別々に記録し、raw候補、Monaco filter後の行、Monaco補助候補を区別する。実装構造から未測定の高速化効果を断定しない。

### 過去のWIP UI snapshot（比較runから分離）

managerの以前の#424 GitHub readback後、PHPantom `863c1337...` とPhpactor WIP head `3e9f56893ea5373b456b8fa12ede89fdc4b37776` をagent-browser `0.39.1`の隔離sessionで各1回開き、PHP 8.5 / Completion ON / 共通fixture末尾への自然`str_`入力後の画面を保存した。両方でSuggest widgetが見え、Phpactorでは選択候補のsignature detailも画面に出た。これは最新#424の一段前のheadで行った画面snapshotであり、詳細trace・性能値・候補件数を取る比較runではない。当時のsource head `e4f36cb8d1544369712ecbbf2a17e704b0a0a633`を使ったp7の別1runは[#424 Loading診断](https://github.com/glassmonkey/php-playground/blob/9eafdcd247ce33dc3b3f2be5f1b34a64747cee76/docs/lsp/phpactor-preview/evidence/completion-loading-2026-10-26.md)を参照。入力手順、head/asset識別、失敗setupの除外、当時の画像は[WIP snapshot記録](evidence/wip-snapshot-2026-10-25T15-20-51Z/README.md)に残す。

## #424 singleflight後の独立追試

manager readbackで#424 OPEN/Draft、source head `388cbe69654113a00a2272cc9e9b2e2a46c5c55`を確認した。隔離agent-browser 0.39.1、port 3471、PHP 8.5/Completion ONの自然`str_`で、slow各2 RPC、fast 1 RPCだった。slowでは最初の`s`と最終`str_`だけ要求され、中間編集版の要求はなかった。古い`s`応答（raw 168）の後に最新要求が送られ、raw 19から画面12行を確認した。fastは最終版の1要求でraw 19/12行。Workerメッセージ境界で同時に未完了のcompletion requestは最大1件だった。これはPHP runtime内部の計測ではない。

Completion OFFでは`didClose`後に自動再要求を観測しなかった。worker終了後の応答も観測できず、製品内部のresponse guardの証拠ではない。PHP 8.4では非対応versionの表示があり、入力してもcompletion RPCは発生しなかった。8.5へ戻した自然`str_`ではraw 19件/12行を確認した。Loading nodeのDOM残存を可視と数えていない。slow 1の厳密な開始/終了は未計測、slow 2は表示style/rectと後の非表示を観測、fast/復帰runはLoadingの可視状態を観測できなかった。DOM観測はphysical paintを保証しない。詳細は[追試記録](evidence/after-singleflight-2026-10-26T03-14Z/README.md)。

この追試はbaselineのagent-browser 1 run（4 RPC/3 obsolete、最終応答6.69秒・Loading約7.08秒）とも過去Playwright runとも入力paceが揃っていない。独立afterのslowは最終入力から最新候補応答まで3.127秒/2.934秒、fastは507ms。速度改善率や一般速度の主張には使わない。ユーザー本人の確認は未実施。製品source変更なし。
