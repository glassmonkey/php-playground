# 中間FB

## 2026-10-25 21:10 JST — PHPantom Worker/UI

- **対象head:** PHPantom UI / Worker、`gla-115-lsp-preview` `863c1337adb05a339dbbd6eb20a9c26eb7b63316`。
- **再現操作:** 隔離Playwright Chrome `156.0.8078.47` でPHP 8.5、同一ファイルfixtureを貼り付け、`strl`、`$gre`、`$greeter->`、`Greeter::`、`new Gre` の位置でCtrl+Space。
- **観測事実:** `strl` は `strlen` 等の候補を表示。`$greeter->` は `message` / `greet()` を表示。`$gre` と `Greeter::` では画面候補が見えず、Worker traceでは `$gre` のcompletion応答に `strlen` 系のitemが含まれ、Monaco側でprefixに合う項目が残らなかった。trace: [phpantom-trace.json](evidence/phpantom-trace.json)。
- **原因仮説・確度:** `$gre` はWorker候補生成/解析結果とMonacoのfiltering境界のどちらかでlocal variable itemが落ちる可能性（中）。`Greeter::` はcompletion応答の記録がなく、原因を特定できていない（低）。
- **確認してほしい点:** 以前の成功条件とこのfixtureの差、PHPantomが返した候補/位置/trigger metadata、`$gre` で変数候補がない理由、`Greeter::` 要求がWorkerへ到達して応答したか。追加の観測事実があればお願いします。変更/最適化は依頼していません。

## 計測条件の訂正

Phpactor用runnerが8.5を選択できたと誤認したが、保存画面ではUIが8.2を表示していた。したがって、Phpactorの2026-10-25 21:02〜21:05 JSTの画像/traceはPHP 8.5比較に使わず、結果表から除外する。runnerはURLに `v=8.5` を明示し、表示も記録するよう修正した。Phpactor 8.5測定が完了したらこの欄に追記する。

## 2026-10-25 21:16 JST — race訂正と同期後の比較（PHPantom / Phpactor）

- **対象head:** PHPantom UI/Worker `863c1337adb05a339dbbd6eb20a9c26eb7b63316`、Phpactor UI/Worker `ee48f4733c802fa39fc3abd54441dd9737017ee8`。
- **訂正:** PHPantom担当のtrace読み取りにより、旧 `id4` は `strl` 時点のtextDocument v4応答、旧 `id7` は `$greeter->` 時点のv6応答であり、後から貼った `$gre` / `Greeter::` の結果ではなかった。旧比較はrace/context mismatchとして撤回。返信に感謝し、Worker応答とdocument changeの対応付けを計測器へ追加した。
- **同期方法:** 各ケースでWorkerへの `textDocument/didChange` に含まれる全文とversionを確認し、requestより前に最新didChangeが対象全文/versionか検査。completion要求のzero-based positionが、コード末尾の期待位置と一致したrequestだけを採用。要求idに対応するWorker responseを待ってから候補画面を確認。
- **実測:** PHP 8.5をUI表示で確認。同期後はPHPantomが `$gre` に `$greeter`, `$greeting`、`$greeter->` に `message`, `greet()`、`Greeter::` に `class-string`、`new Gre` に `Greeter` と `IntlGregorianCalendar` を表示。Phpactorは同じケースでそれぞれ `$greeter`, `$greeting`; `greet()`, `message`; `class Greeter`; `Greeter`, `greetUser`, `$greeter` など5項目。`strl` は両方 `strlen` を表示し、Enter挿入は両方 `strlen($string)` となってprefixを置換した。
- **証拠:** PHPantom同期run [trace](evidence/phpantom-2026-10-25T12-12-47-403Z/trace.json)、Phpactor同期run [trace](evidence/phpactor-2026-10-25T12-13-13-680Z/trace.json)、同じrun directory内の各画像。`evidence/unsynced-20261025/` は無効runを保全した資料。
- **原因仮説・確度:** `$gre` / `Greeter::` の以前の候補なしはbackend制約ではなく、古い文書応答と新しい表示の対応を誤認したraceが原因（高）。候補差は有効な新しい観測として残る。ただしUI/clientのbranch間差もある。Phpactor側は自動triggerの100ms settle、cancellation、completion barrierを加えており、PHPantom側にこれらはない。providerのtrigger characterは両方とも `['$', '>', ':', '\\']`。このため手動Ctrl+SpaceのWorker response時間はLSP側を主に反映するが、通常入力の待ちや古いresponse表示差はclient差を含む。PHPantomは持続WASI runtimeの `lsp_handle` と直列queueを使い、Phpactorは持続PHP WASM runtimeに対して要求ごとに `php.run` とPhpactor container bootを行う（source事実は高、RTT差の全量を説明する因果は中）。frontend baselineもPHPantom React/ReactDOM 18.3.1・Monaco React 4.6.0、Phpactor React/ReactDOM 19.2.3・Monaco React 4.7.0と異なる。worker境界で採ったRTTへの影響は小さいと推定するが、画面表示時間には混在する。
- **計測値:** completion request→Worker response (ms)、r1/r2の順。PHPantom: `strl` 23.6/4.8、`$gre` 10.7/4.8、`->` 23.0/15.5、`::` 12.9/11.3、`new Gre` 107.7/12.8。Phpactor: `strl` 323.0/176.9、`$gre` 174.3/167.7、`->` 211.7/212.1、`::` 169.0/174.6、`new Gre` 148.1/142.4。各2回のChrome観測であり、統計推定ではない。PHPantom `new Gre` のr1 107.7msは初回解析ばらつきの可能性。
- **担当への確認依頼（manager転送）:** 候補セット差の意図/制約（特に `new Gre` の候補範囲と `::` の表示名/detail）、Phpactor要求ごとのcontainer boot、settle/cancellation/barrier設計の制約と改善余地について説明をお願いしたい。実装変更や最適化は依頼しない。同期後のsource/responseで訂正できたため、PHPantom担当への先行候補なし質問は取り下げる。

## 2026-10-25 21:26 JST — raw itemとMonaco表示行の分離

- **対象head/run:** PHPantom `863c1337adb05a339dbbd6eb20a9c26eb7b63316`, [synchronized run](evidence/phpantom-2026-10-25T12-23-18-145Z/trace.json)。Phpactor `ee48f4733c802fa39fc3abd54441dd9737017ee8`, [synchronized run](evidence/phpactor-2026-10-25T12-20-03-437Z/trace.json)。どちらもUIがPHP 8.5を表示。
- **訂正:** 「Phpactor `new Gre` がLSPから5候補を返す」は誤り。raw Worker responseは `items: []`。画面には5行 `Greeter`, `greet`, `greetUser`, `$greeter`, `$greeting` が表示されたが、Completion OFFにした別の隔離contextで同じ5行が再現し、JSON-RPC messageは0件だった。Monacoのword suggestions由来という説明を強く支持する。原条件の画面行は事実として残し、raw itemsと別欄で比べる。
- **raw→表示対応:** `strl`: PHPantom raw4件→画面4行、Phpactor raw6件→画面1行（5つの一般keyword itemはprefix filterで非表示）。`$gre`: 両方raw2→画面2。`$greeter->`: 両方raw2→画面2。`Greeter::`: 両方raw1→画面1。`new Gre`: PHPantom raw5→画面2（3件はMonaco filterで非表示）、Phpactor raw0→画面5（Completion OFFでも5行）。関数call位置でCtrl+Space: PHPantom raw/表示1、Phpactor raw/表示2。全raw itemにlabel/insertText/detail/kind/snippet metadataをtraceに保存。
- **`Greeter::` metadata訂正:** Phpactor raw itemは `label=class`, `insertText=class`, `detail=Greeter`, LSP kind 21（Monaco mappingではConstant）。画面の `class / Greeter` はlabelとdetailの表示で、clientによる「class Greeter」label生成ではない。fixture `Greeter` にはinstance method `greet()` のみでstatic methodは定義していない。このitemをstatic method completionの成功と解釈しない。PHPantom raw itemは `label=class`, `detail=class-string`, kind 14。
- **Completion OFF診断:** Phpactor [trace](evidence/phpactor-word-suggestions-2026-10-25T12-25-32-069Z/trace.json)、PHPantom [trace](evidence/phpantom-word-suggestions-2026-10-25T12-25-57-915Z/trace.json)。両方ともCompletion OFFかつWorker JSON-RPCなしで同一5行が表示された。これは原条件とは別の診断設定である。
- **その他のAPI/画面差:** 実際に `(` をキー入力したsignature helpでは、Phpactorのbuiltin `strlen` はUI tooltipとresponseを表示。local `greetUser` はresponse `null` でtooltipなし。PHPantomは両方tooltipを表示。HoverはPHPantomで `$greeter` のtype `Greeter` を返しtooltip表示、Phpactorでは同じ操作のhover requestを観測できず未確認。
- **原因仮説・確度:** `new Gre` のPhpactor画面5行はMonaco word suggestions（高）。`Greeter::` のPhpactor UIラベルはraw itemの`detail`表示（高）。local signature/hoverのPhpactor差は対応機能/操作条件を分けて追加確認が必要（未確定）。
- **担当への確認依頼（manager転送）:** `new Gre` rawが空のケースとMonaco word rowsの表示を評価上の前提として共有。`::` itemがPHP version/contextごとにどういう意味か、Phpactor local signature null/hover未検出の制約、fallbackやdocumentation/detailの意図を説明してほしい。実装変更依頼ではない。

## 2026-10-25 21:28 JST — manager経由のsource確認

- **Phpactor runtime:** hostでの一回目exit 255はworkspaceがない条件で起き、temporary workspaceでCompleteHandlerを呼ぶと成功したとの担当報告。今回のbrowser UI/Worker失敗ではない。Worker初期化時に `startPHP()` でPHP WASMを一度起動し、各 `php.run` のPHP request中にdispatch include→`Phpactor::boot()`→config/extensions/container再構築を行い、request終了時にPHP request shutdownする。これは現adapterの同期処理方式の制約で、Phpactor固有の必須要件ではない。persistent request/containerや別entry・light boot案は未実装・未検証であり、今回RTT中のboot寄与も未分離。速くなる量や効果は推定しない。
- **new Gre:** Browser UI Worker raw itemsは空。hostのraw CompleteHandlerも同じ8.5 fixtureで空との担当報告。Completion OFFでの5行再現を合わせ、UI表示はMonaco word suggestionsの可能性が高いが、exact completer/provider IDは未確認。`WorseClassMemberCompletor.php` の該当実装位置などsourceの追加確認はmanagerの12:27:01Z inbox回答を根拠にする。
- **Greeter:::** `::class` 疑似定数の候補でstatic methodではない、という担当source回答を追記。元fixtureにはstatic methodがなく、先行runはstatic method補完の証拠にならない。追加したstatic method fixtureのrun結果を別欄へ記録する。
- **Hover:** Phpactorでは今回のUI hover操作から `textDocument/hover` requestを確認できていない。これはserverがnullを返した証拠ではない。pointer/keyboard操作とMonaco provider発火、Worker送信を区別して「未確認」と扱う。

## 2026-10-25 21:35 JST — static method fixtureを含む最終同期run

- **対象head/run:** PHPantom `863c1337adb05a339dbbd6eb20a9c26eb7b63316`, [trace](evidence/phpantom-2026-10-25T12-30-40-981Z/trace.json)。Phpactor `ee48f4733c802fa39fc3abd54441dd9737017ee8`, [trace](evidence/phpactor-2026-10-25T12-31-07-559Z/trace.json)。両方PHP 8.5、Chrome `156.0.8078.47`、同じfixture v2で全文/version/position/request-responseを相関。
- **観測事実:** `fixture.php`には`Greeter::create(): self`を定義。`Greeter::` raw/UIはPHPantomが`class` (detail `class-string`) と`create()`、Phpactorが`class` (insertText `class`, detail `Greeter`, kind 21) とstatic `create()`。前者は`::class`疑似定数で、static methodではない。`new Gre`はPHPantom raw5→UI2、Phpactor raw空→UI5。Phpactorの同じ5行は別contextのCompletion OFF/JSON-RPC 0件でも再現したためMonaco word suggestions説を強く支持するが、provider IDは未確認。Worker RTTはPHPantom 3.1–106.6ms、Phpactor 137.9–347.4msの観測範囲（各ケース2回、内容/処理も違い、統計ではない）。Phpactorの最新runで同期値を更新。全値とraw/display表は[一次批評](evaluation.md)に記載。
- **原因仮説・確度:** Phpactor container bootは各`php.run`内にある現adapterの実装負担だが、Phpactor必須制約ではない。persistent request/containerやlight bootは未実装・未検証、RTT中のboot寄与も未計測。改善効果は不明。`new Gre`画面行のMonaco由来は強く支持するがexact provider未特定。
- **担当への確認依頼:** これまでのworker/UI質問と担当回答を反映し、追加の実装変更依頼はしていない。追加FBが必要になれば、自然typingとexplicit manualの時系列を分けた具体ケースでmanagerへ送る。
- **補足:** PHPantom local signatureとPhpactor builtin signatureは別の有効8.5 runの画面・responseを根拠とし、最新static fixture runでrequest順相関falseの自動signature測定値は比較から外す。Phpactor hoverはrequest自体が未観測。

## 2026-10-25 21:40 JST — Phpactor自然`->`の観測境界を訂正

- **対象head/run:** Phpactor `ee48f4733c802fa39fc3abd54441dd9737017ee8`。旧run [trace](evidence/phpactor-2026-10-25T12-31-07-559Z/trace.json) と新run [trace](evidence/phpactor-2026-10-25T12-38-22-832Z/trace.json)。UI/Workerの対象head変更なし。
- **旧runの事実:** PHP 8.5、Completion checked。editorの[画像](evidence/phpactor-2026-10-25T12-31-07-559Z/typed-arrow-trigger.png)は`->`のみ。trace change v13全文の後にv14 `-`, v15 `->`; completion id30は`line 0, character 2`、空items response。期待位置line8/character10の全文change/request/response/rowはない。page errorは空。active DOM focus/selectionは記録しておらず不明。したがってbackend候補なしではなく、入力fixture/caretが崩れた失敗観測。
- **原因仮説・確度:** runnerの貼り付け後選択が残り、`->`入力が全文を置換した可能性が高い。旧スクリーンショットにeditor全文が消えた状態が出ており、Worker request positionも先頭を示す。selectionそのものは旧runで採取していないため断定は避ける。
- **修正後の確認:** runnerだけを修正し、paste後に`Control+End`。同じPhpactor head/fixtureを隔離BrowserContextで実行。新traceのnatural `->`はdocument version16、全文末尾`$greeter->`、request line8/character10、response 192.1ms、画面`create`, `greet`, `message`。キー操作開始→request 202.7ms。active elementはMonaco Editor content、PHP 8.5、Completion ON、page errorなし。別scenarioのexplicit Ctrl+Spaceでは`$greeter->` 227.7/218.0ms、raw/UI 3件。両操作の結果は別欄/別caseで保持。
- **確認依頼:** manager経由でUI担当へ、旧欠測は自然typingでbackendが候補を返さなかった証拠ではなく、入力全文/カーソルが期待と異なるrunner観測だったと訂正してほしい。新runでは同条件を意図した入力で再現。UI担当から追加で確認したい点があればmanager経由の回答待ち。
- **一次報告:** [evaluation.md](evaluation.md)に旧失敗状態、修正後の時系列、最新Phpactor同期値を追記。implementation changeなし。

## 2026-10-25 22:26 JST — hover / 遅延応答 / first-visible追加追試

- **対象head:** PHPantom `863c1337adb05a339dbbd6eb20a9c26eb7b63316`、Phpactor `ee48f4733c802fa39fc3abd54441dd9737017ee8`。各隔離runでPHP 8.5・同じfixture。
- **hover観測:** `$greeter`への実pointerとMac Monaco `Meta+K`, `Meta+I`で、両UIともprovider request→Worker response→`.monaco-hover` visibleを確認。PHPantom responseは8.5/8.9ms、code-block tooltip。Phpactor responseは114.6/57.6ms、`Greeter` tooltip。page/console errorsなし。trace: [PHPantom](evidence/phpantom-hover-2026-10-25T13-17-33-198Z/trace.json), [Phpactor](evidence/phpactor-hover-2026-10-25T13-17-20-597Z/trace.json)。以前のPhpactor hover「request未観測」は不正確だったため訂正。改良runnerでpointer requestを待ち、tooltip DOMを読むようにした。UI担当へ、Worker contentとtooltip表示内容の変換境界・期待する差を説明してほしい（変更依頼ではない）。
- **遅延response観測:** 隔離Worker message境界で各responseを1.4秒保留。文書変更後の現候補`greet`/`greet()`表示に、旧`$greeter->` responseを後から解放しても旧一覧には戻らなかった。Completion OFF中はWorker terminateを記録し、遅延hover responseはterminate後にharnessが再配送せずdrop。ON/reinitialize/didOpen後に新hoverで回復。trace: [PHPantom](evidence/phpantom-delay-2026-10-25T13-21-21-192Z/trace.json), [Phpactor](evidence/phpactor-delay-2026-10-25T13-20-55-536Z/trace.json)。Worker/Worker source/product serverは未変更。UI/Worker担当にstale response防止の境界と、document version/cancellation/worker generationのどれが保証するかをmanager経由で確認してほしい。人工遅延条件の観測であり通常条件の値と混ぜない。
- **first-visible観測:** MutationObserver後のanimation frameで、候補row+正rect+display/visibility/opacityを満たす初回DOM時刻を採った。`$greeter->`と`strl`をfresh contextの初要求+r2/r3、別アプリ順次で測定。最終trace: [PHPantom](evidence/phpantom-first-visible-2026-10-25T13-26-59-591Z/trace.json), [Phpactor](evidence/phpactor-first-visible-2026-10-25T13-26-48-949Z/trace.json)。各アプリ6 trialで全文/version/position一致、Worker RTT/input→request/input→DOM visibleを別記。physical paintは未保証。初回runnerの相関漏れrunは残すが除外。数値は[evaluation.md](evaluation.md)へ。
- **未特定点:** Completion OFFでも出る`new Gre`のword suggestionsはprovider IDを未特定。可能ならUI担当に最小instrumentationで識別可能か質問してほしいが、provider internals探索は広げない。
- **原因仮説・確度:** hover非表示の旧判定はDOM timing/sample境界の取り違え（高）。stale completionを現画面へ再表示しなかった事実は高、内部でどのguardが抑止したかはsource/担当回答待ち。Phpactor `->`の入力→request間が約188–191ms、sourceの100ms settleに相当する可能性はあるが、入力/React/Monacoなど他要因も含みboot寄与とは分離していない。
- **提出:** 同専用branch/lane、一次commit `d9a2ce9`を保持し、追加commitとDraft PR更新でmanagerレビューへ提出する。

## 2026-10-25 22:35 JST — `str_`実試用の独立確認とguard範囲訂正

- **対象head:** PHPantom `863c1337adb05a339dbbd6eb20a9c26eb7b63316`、Phpactor `ee48f4733c802fa39fc3abd54441dd9737017ee8`。隔離Chrome `156.0.8078.47`、同fixture / PHP 8.5 / Completion ON。
- **`str_`観測:** 貼付け全文後のCtrl+Spaceと、`str`から`_`を実キー入力した自動条件を分離。両方で全文change/version/line7 char4が一致するcompletion request/responseを観測し、今回条件では「候補非表示」を再現しなかった。PHPantom raw32→画面13、Phpactor raw19→画面12（Phpactor rawにはkeyword5件、画面に出ない）。`strl` controlはPHPantom raw4→画面4、Phpactor raw6→画面1 (`strlen`)で、manual/auto間の件数は同じ。trace: [PHPantom](evidence/phpantom-str-prefix-2026-10-25T13-35-08-284Z/trace.json), [Phpactor](evidence/phpactor-str-prefix-2026-10-25T13-35-19-537Z/trace.json)。PHPantom `str_` auto rawにはsignature labelがある一方、manual rawは一部labelがbare function nameだった。候補集合は同じに見え、metadata差の原因は未確定。
- **確認依頼（manager経由UI担当）:** 現制御fixtureでは表示されるため、p7の実試用診断を継続し、報告操作・実文書version・実カーソル/selection/focus/checkbox・raw requestとの相違を確認してほしい。PHPantom `str_` auto/manual response metadata差の生成/resolve境界も説明可能なら教えてほしい。変更依頼なし。
- **遅延応答/guardの訂正:** 文書変更後のcompletion旧responseは両方でharnessから同じWorker response eventとして遅延再配送し、現在候補が維持された。sourceはPHPantom completion/hoverのcurrent-model+document-version確認、Phpactor completionのCancellationToken/raceCompletionCancellation+current-model/version確認、hoverのcurrent-model/version確認。確認範囲に明示的per-request generation counterは見つけていない。一方、Completion OFF caseはterminate後にharnessが古いhover responseを再配送せずdropしたため、製品のgeneration/version guardを検証した結果ではない。ここを報告本文で分離して修正。
- **未特定:** `new Gre`のMonaco補助候補exact provider IDは、この画面/Worker境界の観測では未特定。provider internals探索は拡張せず、UI担当の最小識別回答待ち。
- **一次報告:** [evaluation.md](evaluation.md)に`str_`/`strl` manual/auto表とguard source/behaviorの境界を追加。UI/Worker source、server、owner状態の変更なし。

## 2026-10-25 23:37 JST — Phpactor修正headの自然入力再検証

- **対象/再現:** Phpactor UI修正head `4fd516045ee6aa958bb01c78be5cb76205537894`、branch `gla-115-lsp-phpactor-preview`、clean source worktree、3471保持server。manager READY通知後、隔離Chrome `156.0.8078.47`、PHP 8.5、Completion ON、共通fixture。Ctrl+Spaceなしで`s`から`str_`を160ms/文字と10ms/文字で入力して停止。別caseで`strl`, `$gre`, `$greeter->`, `Greeter::`も自然入力。
- **観測:** slowでは最初の`s`/model v3/line7 char1のrequest id2が3.611秒後に168 itemsを返した時点でmodel v6へ進んでおり、UI source traceが古い応答を破棄。100ms後にautomatic retryし、v6/line7 char4/request id3でraw19 itemsを403msで返し、画面12行。fastではv6/line7 char4のrequest1件でraw19→12行、Worker RTT 502ms。`strl` raw6→1 `strlen` (169ms)、`$gre` 2→2 (165ms)、`->` 3→3 (178ms)、`::` 2→2 (180ms)。source内部trace、DOM rows、画面画像に相関あり。main trace: [run 14-35](evidence/phpactor-natural-after-fix-2026-10-25T14-35-23-888Z/trace.json)。ロード済み`src/lsp/client.ts` SHA-256 `dac9df3998920ccfc6ac62de3bbd781851477b7ec1a8a3ed55c07d4671e92e77`。
- **必須ACの区切り:** 1.8秒停止時点を記録した[run 14-34 slow trace](evidence/phpactor-natural-after-fix-2026-10-25T14-34-22-926Z/str-underscore-slow-trace.json)では、line7/char1へのpartial `s` requestだけでresponse未着、latest request/表示行なし。これは1.8秒境界での自動候補表示AC未達としてmanagerがp7へ差し戻した判定と整合する。run14-35は長時間待ち後の自動retryと最終12行を観測したが、これで1.8秒の未達は解消しない。新head通知まで同じ条件を再試行しない。
- **OFF/version:** pending `s` responseを隔離harness内でholdした状態でOFF。Worker terminate、OFF後1.4秒のcompletion request/didChangeは0、widget非表示。held responseはharnessが再配送せずdropしているため、製品guardの根拠にはしない。ON後に自然入力した`str_`への新要求で19→12行。PHP 8.4切替後1.5秒はcompletion request 0、widget非表示。8.5へ復帰後の自然`str_`は新要求で19→12行。trace: [state run 14-33](evidence/phpactor-natural-state-after-fix-2026-10-25T14-33-05-103Z/trace.json)。
- **原因と確度:** 今回の slow入力で、修正headのsource traceに「初回partial request → response時にdocument-version mismatchとしてdiscard → latest-version retry → rows表示」が連続して記録された。今回操作条件の修正動作として高確度。10ms/160msの各1回なので速度境界・一般性は未測定。DOM-visibleはMutationObserver後の次rAFでありphysical paint保証なし。page/console errorsなし。
- **担当/managerへ共有:** Ctrl+Space必須を外した条件でslow/fastとも最終`str_`が表示され、slowは古い応答破棄後の最新version retryを観測。OFFと8.4切替中に自動再要求なし、8.5復帰後に自然要求が回復。実装変更依頼なし。元baseline PHPantom `863c133...` / Phpactor `ee48f47...`は保持し、修正後値は別欄に追記。
- **除外run:** run `14-25`, `14-26`、state run `14-29-20-769Z`, `14-30-39-994Z`, `14-31-53-425Z` と `14-33-05-103Z`のstale-replay caseはcursor相関、待ち順、focus、synthetic replay等の問題でretry比較から除外。各フォルダREADMEで理由を記す。有効な区切りは1.8秒時点の`14-34-22-926Z`、長時間後のretryは`14-35-23-888Z`、OFF/version遷移は`14-33-05-103Z`内の個別trace。
- **報告:** [evaluation.md](evaluation.md)に修正後Phpactorの自然入力・version/off遷移を別欄として追加。PHPantom新headとの対比較は未実施。採用判断なし。
- **次head再測定手順:** `node scripts/lsp/ui-evaluation/measure-natural-completion.mjs phpactor <manager-confirmed-head> <manager-ready-reference>` はCtrl+Spaceを使わず、`fixture.php`全文を開いた後、空の末尾行へ`s`,`t`,`r`,`_`を160ms/10ms間隔で入力。生成される全文は`fixture.php`の末尾へ`str_`を追加した値、期待位置LSP line7/character4。paste後version2、自然入力のdidChangeは3,4,5,6（今回headでの観測値）。1.8秒停止状態と、その後latest version request/responseを別記する。`diagnose-natural-state-changes.mjs phpactor <head> <ready-ref>` はOFF・PHP8.4・8.5復帰を確認する。両scriptはhead一致とclean source worktreeを検証してから起動する。対象fixture/suffix/位置は[evaluation.md](evaluation.md)に記録。

## 2026-10-26 00:00 JST — 一次選定材料の区切り

- **対象head/状態:** 評価lane `gla-115-ui-evaluation` の直近commitは`5fe0392942619ffc7a852a28bfe3c4cc1c8d202f`。今回の文書追記は未commit。実測したPhpactor head `4fd516045ee6aa958bb01c78be5cb76205537894` は測定時cleanだったが、報告時には同headで`src/editor.tsx`, `src/lsp/client.ts`, `src/lsp/__test__/client.spec.ts`がmodified、`docs/lsp/phpactor-preview/evidence/completion-quick-suggest-v8/`がuntracked。dirty状態は未測定。PHPantom `863c1337adb05a339dbbd6eb20a9c26eb7b63316` はclean。
- **観測/条件差:** Phpactor自然入力slow `str_` は160ms/文字。停止1.8秒時点では`s`/v3/line7 char1のrequestだけでresponse未着、最新prefix request/表示なし。延長観測では初回`s`への168 itemsが3.611秒で届いた後にversion mismatchで破棄され、latest `str_`/v6/line7 char4をretry、raw19→visible12、入力からDOM-visibleまで4.346秒。fast 10ms/文字runはlatest v6 request一件でraw19→12、Worker RTT 502ms、入力からDOM-visible 666ms。よって「最終的に候補が出る」と「停止後1.8秒以内に出る」は別結果で、後者のACは今回未達。速度境界・再現率は未測定。
- **残りの比較:** `strl` 6→1 (`strlen`)、`$gre` 2→2、`$greeter->` 3→3、`Greeter::` 2→2。OFFおよびPHP8.4中はwidget非表示・completion要求0を観測、ONおよび8.5復帰後の自然入力で最新prefix要求が回復。OFF時にholdした応答はharnessがdropしたため製品の応答guardの証拠ではない。
- **原因/負担:** raw `str_`候補19件が確認され、候補本体の不在を示す証拠ではない。今回のslow遅延はadapter/UIの要求時点・古いversion応答の破棄とretry、およびWorker応答待ちを含む経路で観測した。Phpactor boot寄与は未分離。1.8秒を必須にするなら追加のtrigger/settle・in-flight応答・retry調整とブラウザ回帰確認が必要になるが、変更範囲・工数・効果は未測定。candidate rankingを調整する根拠はない。
- **次手/制約:** 新head待ちの再測定は行わず、現有証拠で一次選定材料を締める。修正後再測定には前項の自然入力harnessを使い、1.8秒時点と延長後の最新応答を別run条件として記録する。比較baselineはPHPantom `863c133...`、Phpactor旧head `ee48f473...`のまま保持し、修正head結果を原比較へ混ぜない。採用判断はユーザー。

## 2026-10-26 00:22 JST — WIP 2画面snapshot

- **対象head:** PHPantom `gla-115-lsp-preview` / `863c1337adb05a339dbbd6eb20a9c26eb7b63316` clean。Phpactor `gla-115-lsp-phpactor-preview` / WIP `3e9f56893ea5373b456b8fa12ede89fdc4b37776` clean、managerの#424 readbackに一致。
- **再現と事実:** agent-browser `0.39.1`の専用session `gla115-ui-snapshot-7845ddba0ec6`で、両URLをPHP 8.5 / Completion ONで開いた。共通fixture本文をページ内Monaco modelへセットし、末尾`str_`のみkeyboard typeで入力（Ctrl+Spaceなし）。各ページでSuggest widgetが可視。Phpactor選択rowには`str_contains`のFunction/signature detailが出た。画像と詳細条件は`docs/lsp/ui-evaluation/evidence/wip-snapshot-2026-10-25T15-20-51Z/README.md`。
- **未確認:** raw response、provider origin、request/version/cursor相関、正確な初回表示時刻/1.8秒AC、候補件数、repeatability、host browser version、PHPantom asset hash。これは現WIP画面の短いsnapshotであり、比較traceや安定修正の根拠に置換しない。
- **初回setupの除外:** PHPantomで最初のfill操作後に旧サンプル文が残ったため、その表示は無効として証拠に含めず、Monaco model APIでfixture全体を初期化してから1回だけ有効観察。これ以外の追加試行はしていない。browser sessionは作業後close。
