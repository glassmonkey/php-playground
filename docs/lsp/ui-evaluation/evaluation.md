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

修正runnerの自然入力時刻（入力操作→request、request→response）はPHPantomが`->` 94.7+3.3ms、`::` 95.6+3.4ms、`strl` 16.4+4.2ms。Phpactorは`->` 202.7+192.1ms、`::` 199.4+203.2ms、`strl` 19.7+152.1ms。キー時刻は入力操作直前、request/responseはWorker postMessage観測。この単発runはresponse後にrowを確認するまでで、初回DOM表示は次節で別計測した。

Phpactor UI sourceには自動trigger前の100ms settle、request cancellation、completion barrierがある。下の遅延応答追試では、1.4秒保留した旧候補を文書変更後にUIへ解放したが、新しい`greet`行は維持された。連続typing中の全応答順序や settle の見た目への寄与までは測っていない。最新Phpactor runではsignature相関が有効になったlocal signature responseはnull/tooltipなし、builtin signatureはresponse/tooltipあり。

別の有効な8.5 runでは、Phpactor builtin `strlen(`のsignature help tooltipが表示され、local `greetUser(`はresponse `null`・tooltipなしだった。PHPantomでは両方tooltipが表示され、local signatureは`(string $name = 'Guest'): string`、builtinは`(string $string): int<0, max>`。

同じ8.5 fixtureの`$greeter`でpointer hoverとMac Monaco shortcut `Meta+K`, `Meta+I`を別々に実行した。両方ともrequestはline 5 / character 3。PHPantomはWorker応答8.5/8.9ms、tooltipは`<?php $greeter = Greeter`を含むcode block。Phpactorは114.6/57.6ms、Worker `contents=Greeter`、tooltip text `Greeter`。request→最初の`.monaco-hover`可視DOM mutationはPHPantom 148.3/2.4ms、Phpactor 46.4/3.4ms（pointer/keyboard順）。両方法ともDOM上`.monaco-hover`を確認し、page/console errorなし。結果はPHPantom [hover trace](evidence/phpantom-hover-2026-10-25T13-17-33-198Z/trace.json)とPhpactor [hover trace](evidence/phpactor-hover-2026-10-25T13-17-20-597Z/trace.json)。先行runnerのPhpactor `visible=false`はtooltip非表示を示す証拠ではなく、pointer位置で撮った画像にはtooltipが写り、改良計測でpointer/keyboardとも表示を確認した。旧判定を訂正する。mutation値はpaint時刻ではない。

## 挿入・操作・設定

両UIで`strl`候補をEnter選択すると`strlen($string)`がprefixを置換し、snippetの引数箇所へ移動した。Tabでplaceholderを抜けた後`;`を入力できた。`$gre`から`$greeter`を選んでも`$$greeter`にはならなかった。PHPantomは同じ候補行で`strlen($string)`と`int<0, max>`を見せ、Phpactorは`strlen`とsignature detailを表示した。結果画像は各同期runの`builtin-strl-insert.png`, `builtin-strl-tab.png`, `local-variable-insert.png`。

Completion checkboxをOFFにするとWorkerが終了し、ONで再初期化することを両方で確認。PHPantomはPHP 8.4選択時に「PHP 8.5を使用」とエラー表示し、8.5へ戻すと再初期化した。Phpactorは8.4が未検証という警告を表示し、8.5へ戻した。light/dark切替とCompletion checkbox/HTML Previewの画面上の並びを確認した。keyboard/focusの網羅的なアクセシビリティ評価はしていない。

## 追加追試: 遅延応答と初回DOM表示

応答遅延は隔離ページのWorker message capture listenerで注入した。指定methodのresponseをapp listenerへ渡す前に`stopImmediatePropagation()`で保留し、1.4秒後に同じdataのMessageEventを隔離ページ内でdispatchした。server、product Worker/sourceは変更していない。

- **入力変更後の旧completion:** 両方で`$greeter->`要求（line 7 / character 10）のresponseを1.4秒保留し、文書を`$greeter->g`へ変更してCtrl+Spaceを別requestとして実行。PHPantomは現在候補`greet()`、Phpactorは`greet`を表示。旧3-item responseを解放した後も現在候補1件が維持され、旧候補一覧に戻らなかった。[PHPantom trace](evidence/phpantom-delay-2026-10-25T13-21-21-192Z/trace.json)、[Phpactor trace](evidence/phpactor-delay-2026-10-25T13-20-55-536Z/trace.json)。2要求は別request ID / 文書versionとして記録。
- **hover保留中にCompletion OFF/ON:** hover responseを同じ1.4秒保留中にCompletion OFF。両方でWorker terminateを観測し、保留応答はterminate済みWorkerへ再配送せずdropした。古いtooltipは表示されず、ON後の再initialize/didOpen後に新hover requestを送り、tooltip `Greeter`（Phpactor）/code block（PHPantom）が再表示された。同traceにOFF/ON状態とrequest/responseを記録。これはWorker終了後にresponseが届くよう偽装せず、隔離計測器が配送を破棄した条件である。

初回表示計測は[Phpactor](evidence/phpactor-first-visible-2026-10-25T13-26-48-949Z/trace.json)と[PHPantom](evidence/phpantom-first-visible-2026-10-25T13-26-59-591Z/trace.json)で別々に実行。各アプリ/ケースはfresh BrowserContextを作り、同じ8.5 fixtureで`$greeter->`と`strl`を自然キー入力で各3回実施。r1はそのcontextの初completion request、r2/r3は同Worker内の反復。text/version/request position/response idは全有効runで一致。UIの「first DOM visible」はMutationObserver後の次animation frameに、widgetにrowがあり、rectが正、display/visibilityが有効、opacity>0となった最初のDOM/styleサンプル。physical paint完了までは保証しない。

各行の時刻は`Worker RTT / input→request / input→first DOM visible`（ms）。入力時刻はキー送信直前、RTTはWorker postMessage境界。全試行でWorker responseがDOM-visible sampleより先だった。

| UI / case | r1 first-after-init | r2 same-worker | r3 same-worker |
|---|---:|---:|---:|
| PHPantom `$greeter->` | 19.2 / 90.7 / 127.8 | 8.3 / 88.2 / 128.1 | 8.4 / 87.6 / 127.7 |
| Phpactor `$greeter->` | 201.7 / 192.8 / 413.8 | 90.2 / 189.2 / 297.5 | 84.2 / 188.4 / 280.0 |
| PHPantom `strl` | 9.7 / 15.5 / 44.1 | 2.3 / 13.7 / 45.2 | 2.1 / 14.1 / 45.9 |
| Phpactor `strl` | 182.7 / 17.5 / 213.9 | 86.6 / 14.8 / 110.9 | 71.3 / 15.9 / 89.9 |

`first-after-init` is first completion request after LSP initialize in a new context; it excludes browser/server cold start and is not a process-cold benchmark. Phpactor `->` has source-level 100ms settle before request, reflected in input→request values. These small samples compare these two heads/cases only; no statistical or product-wide performance inference follows.

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

- 今回は入力変更後のold completionを一度ずつ解放して現候補が維持されることを観測した。さらに遅い/逆順の複数response列、PHP 8.4切替時の保留response、HTML Preview unmount等は未測定。
- Word suggestion exact provider IDは未確認。Completion OFF時も同じ行/JSON-RPC 0で再現したためMonaco側由来は強く支持するが、provider内部IDの帰属はこの隔離測定からは分からない。
- Phpactorのlocal `greetUser(` signature helpは全文/version/positionが相関したresponse `null` とtooltipなしを確認した。これがserver feature limitかadapter/runtime差かは特定していない。
- 初期化やCPU競合を揃えた多数回の統計、各内部処理段階の時間、Worker queue待ち、Phpactor boot単独時間は測っていない。2回値から性能一般やboot改善効果を推定しない。
- Completion OFFの診断からMonaco word providerまでは強く支持されるが、exact provider IDはinstrumentしていない。

この資料は候補比較、操作感、計測境界の判断材料であり、総合点・優勝者・採用判断を付けない。

### 確認できた範囲

両UIの隔離ブラウザ操作、同期後のraw completion responseと表示行、Worker RTTとDOM-visible時刻（各代表ケース3試行）、pointer/keyboard hover、遅延response後の候補維持とcheckbox再初期化、挿入/snippet、version/themeを確認した。source読みはruntime/UI差の根拠整理に用いた。

### 反省点

初期runではdocument change race、Phpactor version/caret誤認、hover event待ち漏れ、delay injectionのcase相関漏れ、first-visible反復の古いchange再利用があった。いずれも修正runを別保存し、無効な測定値は比較から除外した。無効runも原因説明用に保持した。

### 次に活かすこと

再測定では見た目だけでケースを対応付けず、全文/version/position/request IDを結ぶ。Worker RTTと入力から表示までの時間を別々に記録し、raw候補、Monaco filter後の行、Monaco補助候補を区別する。実装構造から未測定の高速化効果を断定しない。
