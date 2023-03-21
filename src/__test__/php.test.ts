import { expect, it, describe } from 'vitest'
import { initPHP, runPHP } from "../php";
import { mockFetch } from 'vi-fetch';
import 'vi-fetch/setup';
import * as fs from 'fs'
import { versions } from "../php-wasm/php";

mockFetch.setOptions({
  baseUrl: '',
});

describe("load wasm files", async function() {
  versions.forEach(
    function(v) {
      it(`version: ${v} should echo 1.`, async function() {
        const data = fs.readFileSync(`assets/php-${v}.wasm`);
        const pattern = `php-${v}.wasm?.+`;
        mockFetch("GET", new RegExp(pattern)).willResolve(data.buffer);

        const sut = await initPHP(v);
        expect(sut.version).toBe(v);
        const actual = await runPHP(sut, "<? echo(1);")
        expect(actual).toBe('1');
      });
    }
  );
})