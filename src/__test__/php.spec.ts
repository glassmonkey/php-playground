import { expect, it, describe } from 'vitest'
import { usePHP } from "../php";
// @ts-ignore
import { mockFetch } from "vi-fetch";
import 'vi-fetch/setup';
import * as fs from 'fs'
import { renderHook, waitFor } from '@testing-library/react'

const sleepFunc = (m) => {
  return new Promise((resolve) => setTimeout(resolve, m));
};

mockFetch.setOptions({
  baseUrl: '',
})
it.skip('should increment counter', async () => {
  const v = '8.2';
  const code = "<? echo(1);"

  const data = fs.readFileSync(`assets/php-${v}.wasm`);
  const pattern = `php-${v}.wasm?.+`;
  mockFetch("GET", new RegExp(pattern)).willResolve(data.buffer);
  // When running on jsdom, it does not work well because it depends on the dom.
  // Runtime error occurs.
  const { result } = renderHook(() => usePHP(v, code))
  let [loading, value] = result.current
  expect(loading).toBe(true);
  expect(value).toBe("");
})