import { describe, it, expect } from 'vitest';
import '@vitest/web-worker';
import { convertCodeToPhpPlayground, runPHPInWorker } from '../client';
import fs from 'fs';
import { mockFetch } from 'vi-fetch';
import 'vi-fetch/setup';
import { Version, versions } from '../../php-wasm/php';

async function callPHP(v: Version, code: string) {
	const navigator = globalThis.navigator;
	const originalLanguage = Object.getOwnPropertyDescriptor(navigator, 'language');
	Object.defineProperty(navigator, 'language', {
		configurable: true,
		value: 'ja-JP',
	});
	try {
		const data = fs.readFileSync(`assets/php-${v}.wasm`);
		const pattern = `php-${v}\\.wasm.*`;
		mockFetch('GET', new RegExp(pattern)).willResolve(data.buffer);
		return await runPHPInWorker(v, code);
	} finally {
		if (originalLanguage) {
			Object.defineProperty(navigator, 'language', originalLanguage);
		} else {
			Reflect.deleteProperty(navigator, 'language');
		}
	}
}

describe('worker loader failures', () => {
	it('propagates an unavailable PHP loader error to the caller', async () => {
		await expect(
			runPHPInWorker('9.9' as Version, 'echo(1);')
		).rejects.toThrow('PHP 9.9 assets not found.');
	});
});

describe('load wasm files', async function () {
	it.each(versions)(
		'version: %s should load wasm file, eval(1+1=2)',
		async function (v) {
			const actual = await callPHP(v, 'echo(1+1);');
			expect(actual).toBe('2');
		}
	);
});

describe('show phpinfo()', async function () {
	it.each(versions)('version: %s run phpinfo().', async function (v) {
		let actual = await callPHP(v, 'phpinfo();');
		// Shrink the request time
		actual = actual.replace(
			/(<tr>.+?REQUEST_TIME_FLOAT.+?<td.+?>)([\d.]+)(<\/td><\/tr>)/g,
			'$1--$3'
		);
		actual = actual.replace(
			/(<tr>.+?REQUEST_TIME.+?<td.+?>)([\d.]+)(<\/td><\/tr>)/g,
			'$1--$3'
		);
		expect(actual).toMatchSnapshot();
	});
});

type Script = {
	name: string;
	code: string;
	want: string;
	// Output for the versions that behave differently from `want`.
	wantByVersion?: Partial<Record<Version, string>>;
};

// Several of these call functions through function pointers. Before PHP 8.0
// some of those calls did not match the callee's signature, which traps in
// WebAssembly; build-assets/php*-function-signatures.patch fixes them.
const scripts: Script[] = [
	{
		name: 'date with a timezone',
		code: `date_default_timezone_set('UTC'); echo date('Y', 0);`,
		want: '1970',
	},
	{
		name: 'memory stream',
		code: `$f = fopen('php://memory', 'w+'); fwrite($f, 'abc'); rewind($f); echo fread($f, 3); fclose($f);`,
		want: 'abc',
	},
	{
		name: 'free a resource with unset',
		code: `$t = tmpfile(); fwrite($t, 'x'); unset($t); echo 'ok';`,
		want: 'ok',
	},
	{
		name: 'free a resource by overwriting it',
		code: `$u = fopen('php://memory', 'r'); $u = null; echo 'ok';`,
		want: 'ok',
	},
	{
		name: 'sort',
		code: `$a = [3, 1, 2]; sort($a); echo implode('', $a);`,
		want: '123',
	},
	{
		name: 'asort and ksort',
		code: `$a = ['b' => 2, 'a' => 1]; asort($a); ksort($a); echo implode(',', array_keys($a));`,
		want: 'a,b',
	},
	{
		name: 'array_multisort',
		code: `$x = [3, 1, 2]; $y = ['c', 'a', 'b']; array_multisort($x, $y); echo implode('', $y);`,
		want: 'abc',
	},
	{
		name: 'usort with a closure',
		code: `$a = [3, 1, 2]; usort($a, function ($x, $y) { return $x - $y; }); echo implode('', $a);`,
		want: '123',
	},
	{
		name: 'shuffle and sort',
		code: `$a = range(1, 1000); shuffle($a); sort($a); echo $a[0];`,
		want: '1',
	},
	{
		name: 'array_map with a closure',
		code: `echo implode('', array_map(function ($v) { return $v * 2; }, [1, 2]));`,
		want: '24',
	},
	{
		name: 'preg_replace_callback',
		code: `echo preg_replace_callback('/\\d/', function ($m) { return '<' . $m[0] . '>'; }, 'a1b2');`,
		want: 'a<1>b<2>',
	},
	{
		name: 'recursive function',
		code: `function fib($n) { return $n < 2 ? $n : fib($n - 1) + fib($n - 2); } echo fib(20);`,
		want: '6765',
	},
	{
		name: 'generator',
		code: `function gen() { yield 1; yield 2; } $g = 0; foreach (gen() as $x) { $g += $x; } echo $g;`,
		want: '3',
	},
	{
		name: 'clone a generator',
		code: `$f = function () { static $s = 5; yield $s; }; $g = $f(); try { $h = clone $g; foreach ($h as $v) { echo $v; } } catch (Error $e) { echo 'noclone'; }`,
		want: 'noclone',
		// PHP 5.6 has no Error class to catch, so cloning is a fatal error.
		wantByVersion: {
			'5.6': '<br />\n<b>Fatal error</b>:  Trying to clone an uncloneable object of class Generator in <b>php-wasm run script</b> on line <b>1</b><br />\n',
		},
	},
	{
		name: 'exception',
		code: `try { throw new Exception('e'); } catch (Exception $e) { echo $e->getMessage(); }`,
		want: 'e',
	},
	{
		name: 'json_encode',
		code: `echo json_encode(['k' => [1, 2]]);`,
		want: '{"k":[1,2]}',
	},
	{
		name: 'sprintf',
		code: `echo sprintf('%05.1f', 3.14159);`,
		want: '003.1',
	},
	{
		name: 'md5 of a built string',
		code: `$s = ''; for ($i = 0; $i < 1000; $i++) { $s .= chr(65 + $i % 26); } echo md5($s);`,
		want: '1411ffd5854fa029dc4d231aa89311eb',
	},
	{
		name: 'associative array',
		code: `$arr = array(); for ($i = 0; $i < 1000; $i++) { $arr['k' . $i] = $i; } echo array_sum($arr);`,
		want: '499500',
	},
	{
		name: 'ArrayObject',
		code: `$o = new ArrayObject([1, 2, 3]); echo count($o);`,
		want: '3',
	},
	{
		name: 'long string',
		code: `echo strlen(str_repeat('z', 100000));`,
		want: '100000',
	},
	{
		name: 'microtime',
		code: `echo microtime(true) > 0 ? 'ok' : 'ng';`,
		want: 'ok',
	},
	{
		name: 'list zend extensions',
		// Brackets keep the output non-empty: runPHPInWorker never resolves on
		// an empty output.
		code: `echo '[' . implode(',', get_loaded_extensions(true)) . ']';`,
		want: '[]',
		// PHP 8.5 always builds OPcache in.
		wantByVersion: { '8.5': '[Zend OPcache]' },
	},
];

describe('run php code', async function () {
	const cases = versions.flatMap((version) =>
		scripts.map(({ wantByVersion, ...script }) => ({
			...script,
			version,
			want: wantByVersion?.[version] ?? script.want,
		}))
	);

	it.each(cases)(
		'version: $version $name',
		async function ({ version, code, want }) {
			// Act
			const got = await callPHP(version, code);
			// Assert
			expect(got).toBe(want);
		}
	);
});

describe('convert code to php code for wasm', async function () {
	const testCases = [
		{ input: '<? echo(1);', expected: 'echo(1);' },
		{ input: '<?php echo(1);', expected: 'echo(1);' },
		{ input: '<?php\n echo(1);', expected: 'echo(1);' },
		{ input: '<?\n echo(1);', expected: 'echo(1);' },
		{ input: 'Hello, World', expected: '?>Hello, World' },
		{
			input: '<body><?echo 1+1?></body>',
			expected: '?><body><?echo 1+1?></body>',
		},
		{
			input: '<? declare(strict_types=1); echo 1;',
			expected: 'declare(strict_types=1); echo 1;',
		},
		{
			input: '<body><? declare(ticks=1); echo 1+1?></body>',
			expected: '?><body><? declare(ticks=1); echo 1+1?></body>',
		},
	];

	it.each(testCases)('input: %s to %s', async function (testCase) {
		const actual = convertCodeToPhpPlayground(testCase.input);
		expect(actual).toBe(testCase.expected);
	});
});
