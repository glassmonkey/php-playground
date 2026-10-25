import type { Version } from '../php-wasm/php';

export function phpactorVersionError(version: Version): string | undefined {
	return version === '8.5'
		? undefined
		: 'Phpactor analysis is verified only for PHP 8.5. Select PHP 8.5 to enable completion.';
}
