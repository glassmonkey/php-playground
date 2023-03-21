import { PHP, startPHP, Version } from './php-wasm/php';
import { useEffect, useState } from 'react';

async function initPHP(v: Version) {
	// todo handling when load failed
	const PHPLoaderModule = await import(`./php-${v}.js`);
	return startPHP(v, PHPLoaderModule, 'WEB', {});
}

async function runPHP(php: PHP, code: string) {
	const output = php.run({
		code: code,
	});
	return new TextDecoder().decode(output.body);
}

export function usePHP(version: Version, code: string): [boolean, string] {
	const [php, setPHP] = useState<PHP | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [internalCode, setInternalCode] = useState<string>('');
	const [result, setResult] = useState<string>('');

	useEffect(
		function () {
			if (php?.version != version) {
				setLoading(true);
				queueMicrotask(async function () {
					setPHP(await initPHP(version));
				});
				return;
			}

			if (internalCode != code) {
				setLoading(true);
				setInternalCode(code);
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
