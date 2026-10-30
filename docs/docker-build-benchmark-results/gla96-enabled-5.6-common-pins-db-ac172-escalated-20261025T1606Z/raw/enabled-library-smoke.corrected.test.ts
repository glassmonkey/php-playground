import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as phpLoaderModule from '../../../docs/docker-build-benchmark-results/gla96-enabled-5.6-common-pins-db-ac172-escalated-20261025T1606Z/exported-assets/php-5.6.js';
import { startPHP } from '../php';

const phpWasm = readFileSync(new URL('../../../docs/docker-build-benchmark-results/gla96-enabled-5.6-common-pins-db-ac172-escalated-20261025T1606Z/exported-assets/php-5.6.wasm', import.meta.url));

it('runs PHP 5.6 enabled extensions with common pinned libraries through the public runtime API', async () => {
  const php = await startPHP('5.6', phpLoaderModule, 'NODE', { wasmBinary: phpWasm });
  const response = php.run({
    code: `
$gd = function_exists('imagepng');
$png = '';
if ($gd) { $image = imagecreatetruecolor(2, 2); ob_start(); imagepng($image); $png = ob_get_clean(); }
$db = new SQLite3(':memory:');
$db->exec('CREATE TABLE sample (value TEXT)');
$db->exec("INSERT INTO sample VALUES ('sqlite-ok')");
$zipPath = '/gla96-smoke.zip';
$zip = new ZipArchive();
$zipOpen = $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$zipWrite = ($zipOpen === true || $zipOpen === 0) && $zip->addFromString('entry.txt', 'zip-ok');
if ($zipOpen === true || $zipOpen === 0) { $zip->close(); }
$zipRead = new ZipArchive();
$zipReadOpen = $zipRead->open($zipPath);
$zipValue = ($zipReadOpen === true || $zipReadOpen === 0) ? $zipRead->getFromName('entry.txt') : false;
if ($zipReadOpen === true || $zipReadOpen === 0) { $zipRead->close(); }
$cipher = openssl_encrypt('crypto-ok', 'AES-128-CBC', 'secret', OPENSSL_RAW_DATA, str_repeat(chr(0), 16));
$crypto = $cipher !== false && openssl_decrypt($cipher, 'AES-128-CBC', 'secret', OPENSSL_RAW_DATA, str_repeat(chr(0), 16)) === 'crypto-ok';
ob_start(); phpinfo(INFO_MODULES); $moduleInfo = strip_tags(ob_get_clean());
$zlibVersion = preg_match('/Compiled Version\s+([0-9.]+)/', $moduleInfo, $matches) ? $matches[1] : '';
$compressed = gzcompress('zlib-ok');
$zlib = $compressed !== false && gzuncompress($compressed) === 'zlib-ok';
$dom = new DOMDocument();
$xml = $dom->loadXML('<root><item>xml-ok</item></root>');
echo json_encode([
  'version' => PHP_VERSION,
  'gd' => $gd && bin2hex(substr($png, 0, 8)) === '89504e470d0a1a0a',
  'sqlite' => $db->querySingle('SELECT value FROM sample') === 'sqlite-ok',
  'zip' => $zipWrite && $zipValue === 'zip-ok',
  'openssl' => $crypto && strpos(OPENSSL_VERSION_TEXT, '1.1.1w') !== false,
  'openssl_version' => OPENSSL_VERSION_TEXT,
  'zlib_version' => $zlibVersion,
  'zlib' => $zlib,
  'xml' => $xml && $dom->getElementsByTagName('item')->item(0)->textContent === 'xml-ok',
  'mbstring' => function_exists('mb_strlen') && mb_strlen('こんにちは', 'UTF-8') === 5,
]);
`,
  });
  expect(response.exitCode).toBe(0);
  expect(response.errors).toBe('');
  expect(JSON.parse(new TextDecoder().decode(response.body))).toEqual({
    version: '5.6.41-dev', gd: true, sqlite: true, zip: true, openssl: true,
    openssl_version: expect.stringContaining('1.1.1w'), zlib_version: '1.3.2', zlib: true,
    xml: true, mbstring: true,
  });
});
