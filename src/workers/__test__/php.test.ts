import { expect, it, describe } from 'vitest';
import { convertCodeToPhpPlayground } from '../client';
import { initPHP, runPHP } from '../php-worker';
// @ts-ignore
import { mockFetch } from 'vi-fetch';
// @ts-ignore
import 'vi-fetch/setup';
import * as fs from 'fs';
import { versions } from '../../php-wasm/php';

mockFetch.setOptions({
	baseUrl: '',
});

describe('load wasm files', async function () {
	versions.forEach(function (v) {
		it(`version: ${v} should echo 1.`, async function () {
			const data = fs.readFileSync(`assets/php-${v}.wasm`);
			const pattern = `php-${v}.wasm?.+`;
			mockFetch('GET', new RegExp(pattern)).willResolve(data.buffer);
			// Runtime error occurs, but you can ignore it because it is a problem with the way wasm is loaded.
			const sut = await initPHP(v);
			expect(sut.version).toBe(v);
			const actual = await runPHP(sut, 'echo(1);');
			expect(actual).toBe('1');
		});
	});
});

describe('show phpinfo()', async function () {
	versions.forEach(function (v) {
		it(`version: ${v} run phpinfo().`, async function () {
			const data = fs.readFileSync(`assets/php-${v}.wasm`);
			const pattern = `php-${v}.wasm?.+`;
			mockFetch('GET', new RegExp(pattern)).willResolve(data.buffer);
			// Runtime error occurs, but you can ignore it because it is a problem with the way wasm is loaded.
			const sut = await initPHP(v);
			expect(sut.version).toBe(v);
			let actual = await runPHP(sut, 'phpinfo();');
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
