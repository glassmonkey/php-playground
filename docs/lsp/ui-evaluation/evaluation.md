# GLA-115 両UIの一次批評

## 対象と方法

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

自然入力の時刻列（入力操作→request、request→response）はPHPantomが`->` 94.7+3.3ms、`::` 95.6+3.4ms、`strl` 16.4+4.2ms。Phpactorは`::` 199.3+198.9ms、`strl` 20.6+158.3ms。キー入力時刻はrunnerがキー操作を始めた時点、request/responseはWorker postMessage観測。画面rowはresponse後の確認で出たが、このauto測定では最初のDOM表示時刻を取っていない。従って数字はend-to-endの正確な画面表示時間ではない。

Phpactor UI sourceには自動trigger前の100ms settle、request cancellation、completion barrierがある。通常入力時系列は、キー入力時刻からWorker requestまでだけでなく、その後の画面表示や応答破棄も含む。今回のrunnerは代表的な自然入力を実施したが、旧responseの遅延注入・逆順到着や長文連続typing中の表示時系列を統制していない。したがって100ms settleが見た目にどう寄与するか、古い候補をどこまで抑えるかは未評価。最新Phpactor runではsignature相関が有効になったlocal signature responseはnull/tooltipなし、builtin signatureはresponse/tooltipあり。

別の有効な8.5 runでは、Phpactor builtin `strlen(`のsignature help tooltipが表示され、local `greetUser(`はresponse `null`・tooltipなしだった。PHPantomでは両方tooltipが表示され、local signatureは`(string $name = 'Guest'): string`、builtinは`(string $string): int<0, max>`。PHPantom hoverは`$greeter`で`Greeter`を表示。Phpactorは今回のpointer操作からhover request自体を観測していないため、server nullや未対応とは結論できない。証拠画像は各traceと同じdirectoryの`local-signature.png`、`builtin-signature-help.png`、`hover-local-variable.png`を参照。

## 挿入・操作・設定

両UIで`strl`候補をEnter選択すると`strlen($string)`がprefixを置換し、snippetの引数箇所へ移動した。Tabでplaceholderを抜けた後`;`を入力できた。`$gre`から`$greeter`を選んでも`$$greeter`にはならなかった。PHPantomは同じ候補行で`strlen($string)`と`int<0, max>`を見せ、Phpactorは`strlen`とsignature detailを表示した。結果画像は各同期runの`builtin-strl-insert.png`, `builtin-strl-tab.png`, `local-variable-insert.png`。

Completion checkboxをOFFにするとWorkerが終了し、ONで再初期化することを両方で確認。PHPantomはPHP 8.4選択時に「PHP 8.5を使用」とエラー表示し、8.5へ戻すと再初期化した。Phpactorは8.4が未検証という警告を表示し、8.5へ戻した。light/dark切替とCompletion checkbox/HTML Previewの画面上の並びを確認した。keyboard/focusの網羅的なアクセシビリティ評価はしていない。

## 差の原因と確度

| 要因 | 観測・source根拠 | 確度と限界 |
|---|---|---|
| 言語サーバの候補・metadata | 同期後のraw responseに候補数・detail・kind・snippetの違いがある。特に`new Gre`のPhpactor rawは空、PHPantom rawは5。Phpactorの`Greeter::`は`::class`とstatic `create`が別item。 | raw内容の事実は高。候補差がライブラリ固有かadapter/config/context由来かの帰属は未分離。 |
| 実行方式とrequest処理 | PHPantom Workerは持続WASI上で`lsp_handle`をqueue処理。Phpactor Workerは`startPHP()`後、各`php.run`でdispatch include→`Phpactor::boot()`→config/extensions/container構築→request shutdown。 | source構造は高。Phpactor worker担当によればこれは現adapterの同期方式の負担でPhpactor必須制約ではない。persistent request/containerやlight bootは未実装・未検証で、今回RTT内のboot寄与も未分離。効果や改善量は未確定。 |
| UI/client timingと変換 | Phpactor側に100ms settle、cancellation、completion barrier。rawと画面行の数が異なるケースを観測。React/Monaco frontend dependency baselineも両branchで異なる。 | source上の差は高。通常入力の体感への寄与率は中〜低。`new Gre` 5行はMonaco由来が強いがprovider ID不明。画面計時にはReact/Monaco表示処理も混ざる。 |

Phpactor host CompleteHandlerの`new Gre`もraw空だったとの担当報告があり、ブラウザWorkerだけの障害という解釈は支持されない。担当からは該当completer source位置として`WorseClassMemberCompletor.php:124`が示された。初回host command exit 255はworkspace欠落で、temporary workspaceでは成功したとの回答であり、ブラウザ機能失敗には一般化しない。

## 再現手順と証拠

1. 各対象URLを開きPHP 8.5、HTML mode、Completion ONを画面で確認する。
2. [fixture.php](fixture.php)全文を貼り付け、`strl`, `$gre`, `$greeter->`, `Greeter::`, `new Gre`, `greetUser(`, `strlen(`をそれぞれ末尾に置く。
3. 手動候補比較はCtrl+Space。自動trigger比較は末尾に実キーで`->`, `::`, `l`を入力し、両操作の候補と時系列を混ぜない。
4. raw itemsはtrace内のrequest IDに一致するWorker response、画面行は同runの`*.png`で確認する。
5. `new Gre`のword suggestion診断だけは別contextでCompletion OFFの状態を保ち、Ctrl+Space後に行とJSON-RPC数を記録する。これは原条件の候補数に足さない。

traceには全postMessageとtimestamp、response、文書version、位置、raw items、表示行を保存した。無効な旧runも消さず、`unsynced-20261025`に根拠とともに残した。

## 未確認と小さな追加実験案

- 自然typing中に旧候補を画面に残すか、古いversionの遅延応答を破棄するかは未測定。固定sleepで同期を代用せず、キー時刻、各全文/version、request、response、候補表示時刻を1ケースずつ記録し、同じ遅延応答を隔離contextで再生すると切り分けられる。
- PhpactorのhoverはMonaco hover操作がproviderを発火しWorkerへ送るところから再確認する必要がある。現状の「requestなし」をserver未対応とは扱わない。
- signature helpは有効な過去の8.5 runの画面・response証拠を採用し、最新runの自動相関がfalseになった値は未確定として除外した。
- 初期化やCPU競合を揃えた多数回の統計、各内部処理段階の時間、Worker queue待ち、Phpactor boot単独時間は測っていない。2回値から性能一般やboot改善効果を推定しない。
- Completion OFFの診断からMonaco word providerまでは強く支持されるが、exact provider IDはinstrumentしていない。

この資料は候補比較、操作感、計測境界の判断材料であり、総合点・優勝者・採用判断を付けない。

### 確認できた範囲

両UIの隔離ブラウザ操作、同期後のraw completion responseと表示行、少数回のWorker RTT、挿入/snippet、checkbox/version/theme、代表的な自動trigger、signature/hoverの一部を確認した。source読みはruntime/UI差の根拠整理に用いた。

### 反省点

初期の手動runnerではdocument changeを待たずにrequestを送り、古いversionのresponseを新しい入力の結果と誤認した。Phpactor PHP versionも最初のrunで誤認した。いずれも初期結果を比較から撤回し、無効証拠は保全した。最新signature一部も相関検査がfalseで採用していない。

### 次に活かすこと

再測定では見た目だけでケースを対応付けず、全文/version/position/request IDを結ぶ。Worker RTTと入力から表示までの時間を別々に記録し、raw候補、Monaco filter後の行、Monaco補助候補を区別する。実装構造から未測定の高速化効果を断定しない。
