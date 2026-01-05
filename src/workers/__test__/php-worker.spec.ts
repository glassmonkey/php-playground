import { describe, it, expect } from 'vitest';
import '@vitest/web-worker';
import { convertCodeToPhpPlayground, runPHPInWorker, simple } from '../client';
import fs from 'fs';
import { mockFetch } from 'vi-fetch';
import 'vi-fetch/setup';
import {Version, versions} from '../../php-wasm/php';

async function callPHP(v: Version, code: string) {
	const data = fs.readFileSync(`assets/php-${v}.wasm`);
	const pattern = `php-${v}\\.wasm.*`;
	mockFetch('GET', new RegExp(pattern)).willResolve(data.buffer);
	return runPHPInWorker(v, code);
}


describe('load wasm files', async function () {
	it.each(versions)('version: %s should load wasm file, eval(1+1=2)', async function (v) {
		const actual = await callPHP(v, 'echo(1+1);');
		expect(actual).toBe('2');
	})
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
	})
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
