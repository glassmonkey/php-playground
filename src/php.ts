import { PHP, startPHP, Version } from './php-wasm/php';
import { useEffect, useState } from 'react';

const phpWasmLoaders = import.meta.glob('./wasm-assets/php-*.js');

async function loadPHPLoaderModule(v: Version) {
	// Lazy-load the matching wasm loader; this only resolves for versions with assets on disk.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const loader = phpWasmLoaders[`./wasm-assets/php-${v}.js`] as
		| (() => Promise<any>)
		| undefined;
	if (!loader) {
		throw Error(`PHP ${v} assets not found. Build them with make build-${v}.`);
	}
	// @ts-ignore
	return loader();
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
