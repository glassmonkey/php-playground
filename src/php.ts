import { PHP, startPHP, Version } from './php-wasm/php';
import { useEffect, useState } from 'react';

async function loadPHPLoaderModule(v: Version) {
	switch (v) {
		case '5.6':
			// @ts-ignore
			return import('./wasm-assets/php-5.6.js');
		case '7.0':
			// @ts-ignore
			return import('./wasm-assets/php-7.0.js');
		case '7.1':
			// @ts-ignore
			return import('./wasm-assets/php-7.1.js');
		case '7.2':
			// @ts-ignore
			return import('./wasm-assets/php-7.2.js');
		case '7.3':
			// @ts-ignore
			return import('./wasm-assets/php-7.3.js');
		case '7.4':
			// @ts-ignore
			return import('./wasm-assets/php-7.4.js');
		case '8.0':
			// @ts-ignore
			return import('./wasm-assets/php-8.0.js');
		case '8.1':
			// @ts-ignore
			return import('./wasm-assets/php-8.1.js');
		case '8.2':
			// @ts-ignore
			return import('./wasm-assets/php-8.2.js');
		case '8.3':
			// @ts-ignore
			return import('./wasm-assets/php-8.3.js');
		case '8.4':
			// @ts-ignore
			return import('./wasm-assets/php-8.4.js');
		default:
			/* eslint no-case-declarations: 0 */
			/* eslint @typescript-eslint/no-unused-vars: 0 */
			const x: never = v;
			throw Error('not defined version');
	}
}

export async function initPHP(v: Version) {
	// todo handling when load failed
	const PHPLoaderModule = await loadPHPLoaderModule(v);
	return startPHP(v, PHPLoaderModule, 'WEB', {});
}

export async function runPHP(php: PHP, code: string) {
	const output = php.run({
		code: code,
	});
	return new TextDecoder().decode(output.body);
}

// Convert code to PHP code
export function convertCodeToPhpPlayground(code: string) {
	const phpPrefixPattern = /^<\?(php)?\s+/g;

	const hasPhpPrefix = code.match(phpPrefixPattern);
	let phpCode = code.replace(phpPrefixPattern, '');
	// Add PHP tag if not exists
	if (!hasPhpPrefix) {
		phpCode = '?>' + phpCode;
	}
	return phpCode;
}

export function usePHP(version: Version, code: string): [boolean, string] {
	const [php, setPHP] = useState<PHP | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [internalCode, setInternalCode] = useState<string>('');
	const [result, setResult] = useState<string>('');

	const phpCode = convertCodeToPhpPlayground(code);

	useEffect(
		function () {
			if (php?.version != version) {
				setLoading(true);
				queueMicrotask(async function () {
					setPHP(await initPHP(version));
				});
				return;
			}

			if (internalCode != phpCode) {
				setLoading(true);

				setInternalCode(phpCode);
				return;
			}
			if (!loading) {
				return;
			}

			if (internalCode == '') {
				setResult('empty data');
				setLoading(false);
				return;
			}

			setTimeout(async function () {
				const info = await runPHP(php, internalCode);
				setResult(info);
				setLoading(false);
			}, 15);
		},
		[php, code, internalCode, loading, version]
	);

	return [loading, result];
}
