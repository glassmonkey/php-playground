import { expect, it, describe } from 'vitest';
import { initPHP, runPHP } from '../php';
// @ts-ignore
import { mockFetch } from 'vi-fetch';
// @ts-ignore
import 'vi-fetch/setup';
import * as fs from 'fs';
import { versions } from '../php-wasm/php';

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
			const actual = await runPHP(sut, '<? echo(1);');
			expect(actual).toBe('1');
		});
	});
});

describe("show phpinfo()", async function() {
  versions.forEach(
    function(v) {
      it(`version: ${v} run phpinfo().`, async function() {
        const data = fs.readFileSync(`assets/php-${v}.wasm`);
        const pattern = `php-${v}.wasm?.+`;
        mockFetch("GET", new RegExp(pattern)).willResolve(data.buffer);
        // Runtime error occurs, but you can ignore it because it is a problem with the way wasm is loaded.
        const sut = await initPHP(v);
        expect(sut.version).toBe(v);
        let actual = await runPHP(sut, "<? phpinfo();")
        // Shrink the request time
        actual = actual.replace(/(<tr>.+?REQUEST_TIME_FLOAT.+?<td.+?>)([\d\.]+)(<\/td><\/tr>)/g, '$1--$3')
        actual = actual.replace(/(<tr>.+?REQUEST_TIME.+?<td.+?>)([\d\.]+)(<\/td><\/tr>)/g, '$1--$3')
        expect(actual).toMatchSnapshot()
      })
    }
  );
})
