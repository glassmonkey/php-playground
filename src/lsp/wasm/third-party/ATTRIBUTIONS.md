# PHPantom third-party attribution index

このファイルは本プロジェクトが作成した帰属情報の索引です。upstreamのNOTICE原文ではありません。同じディレクトリにあるライセンスとREADMEは固定した原典のコピーです。原典のcommit、URL、SHA-256はmanifest.jsonに記録しています。法的な十分性や、Rustのリンク対象を網羅したSBOMの完成を宣言するものではありません。

PHPantomのMIT原文、JetBrains phpstorm-stubsのApache原文とREADME、Mago parserのMIT/Apache原文を同梱します。PHP manual由来の文面とPHP Documentation Group / CC BY 3.0の説明は、[同梱READMEのLicense節](phpstorm-stubs/README.md#license)と[固定commitの原典](https://github.com/JetBrains/phpstorm-stubs/blob/2049ca3cfa1feabf52db074108fe776a5713cf02/README.md#license)を参照してください。

## embedded definition headers

以下は実際の埋込一覧に含まれる定義の先頭コメントです。原文を引用しています。他の定義や同じcomponent全体のライセンスは推定していません。ソース内の元のヘッダーも変更していません。

### aerospike/Bytes.php

Source: https://github.com/JetBrains/phpstorm-stubs/blob/2049ca3cfa1feabf52db074108fe776a5713cf02/aerospike/Bytes.php

Original file SHA-256: `3290096b91213267500970e350ca526d3275c58ff9e8175f415233c86c3fd280`

```text
/**
 * Copyright 2013-2016 Aerospike, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @category   Database
 * @author     Ronen Botzer <rbotzer@aerospike.com>
 * @copyright  Copyright 2013-2016 Aerospike, Inc.
 * @license    http://www.apache.org/licenses/LICENSE-2.0 Apache License, Version 2
 * @link       https://github.com/aerospike/aerospike-client-php/blob/master/doc/README.md#handling-unsupported-types
 * @filesource
 */
```

### aerospike/aerospike.php

Source: https://github.com/JetBrains/phpstorm-stubs/blob/2049ca3cfa1feabf52db074108fe776a5713cf02/aerospike/aerospike.php

Original file SHA-256: `60c31121b9f4f6ddbd8a6a77c5d6f6aff873d8bef6bbfc12bd878219a2d8b71e`

```text
/**
 * Copyright 2013-2017 Aerospike, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @category   Database
 * @package    Aerospike
 * @author     Robert Marks <robert@aerospike.com>
 * @copyright  Copyright 2013-2018 Aerospike, Inc.
 * @license    http://www.apache.org/licenses/LICENSE-2.0 Apache License, Version 2
 * @link       https://www.aerospike.com/docs/client/php/
 * @filesource
 */
```

### cassandra/cassandra.php

Source: https://github.com/JetBrains/phpstorm-stubs/blob/2049ca3cfa1feabf52db074108fe776a5713cf02/cassandra/cassandra.php

Original file SHA-256: `6dfc178b24090d51a9cae5ab93ddcaff34b28a823878c4ac31fbb46e50ff9e07`

```text
/**
 * Helper autocomplete for php cassandra extension.
 * Compiled using the https://github.com/datastax/php-driver/blob/master/ext/doc/generate_doc.sh
 *
 * @see https://github.com/datastax/php-driver/tree/master/ext/doc
 *
 * @author Vasyl Sovyak <soulshockers@gmail.com>
 * @link   https://github.com/soulshockers/cassandra-phpdoc
 */
```

### ds/ds.php

Source: https://github.com/JetBrains/phpstorm-stubs/blob/2049ca3cfa1feabf52db074108fe776a5713cf02/ds/ds.php

Original file SHA-256: `8b2405b75913799ecfa84391b5e28d9abd5ec8131a8bba04b2eca135e2514c8a`

```text
/**
 * PHP Data Structure stubs, a PECL extension
 * @version 1.0.0
 * @author Dominic Guhl <dominic.guhl@posteo.de>
 * @copyright © 2019 PHP Documentation Group
 * @license CC-BY 3.0, https://www.php.net/manual/en/cc.license.php
 */
```

### event/event.php

Source: https://github.com/JetBrains/phpstorm-stubs/blob/2049ca3cfa1feabf52db074108fe776a5713cf02/event/event.php

Original file SHA-256: `c7db5ab83430dc257aa31848eec62a77a20ddcdc94f5f55e54623a50008e2ce9`

```text
/**
 * Event.
 * Event class represents and event firing on a file descriptor being ready to read from or write to; a file descriptor becoming ready to read from or write to(edge-triggered I/O only); a timeout expiring; a signal occurring; a user-triggered event.
 * Every event is associated with EventBase . However, event will never fire until it is added (via Event::add() ). An added event remains in pending state until the registered event occurs, thus turning it to active state. To handle events user may register a callback which is called when event becomes active. If event is configured persistent , it remains pending. If it is not persistent, it stops being pending when it's callback runs. Event::del() method deletes event, thus making it non-pending. By means of Event::add() method it could be added again.
 *
 * @author Kazuaki MABUCHI
 * @copyright Сopyright (https://php.net/manual/cc.license.php) by the PHP Documentation Group is licensed under [CC by 3.0 or later](https://creativecommons.org/licenses/by/3.0/).
 *
 * @see https://php.net/manual/en/class.event.php
 */
```

### redis/RedisSentinel.php

Source: https://github.com/JetBrains/phpstorm-stubs/blob/2049ca3cfa1feabf52db074108fe776a5713cf02/redis/RedisSentinel.php

Original file SHA-256: `5ceda3d0740fe388ae368720f7ca6f73d7efce7c18ab545482aa6eeda659fbaa`

```text
/**
 * The MIT License (MIT)
 *
 * Copyright (c) Tawana Musewe
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * <https://opensource.org/licenses/MIT>.
 */
```

## Scope

全Rust dependencyやupstream testsのlicense一式を同梱したとは扱いません。PHPStan/Psalm/Phpactorへのupstream README謝辞だけからcode同梱を推定しません。上流archiveに存在しなかったNOTICEを上流原文として作成していません。法的評価とrelease/adoptionの判断は別です。
