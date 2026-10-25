export function phpVersionInitializationError(options) {
	if (typeof options !== 'object' || options === null) return undefined;
	const phpVersion = options.phpVersion;
	if (phpVersion === undefined) return undefined;
	if (typeof phpVersion !== 'string' || !/^\d+\.\d+$/.test(phpVersion)) {
		return 'initializationOptions.phpVersion must be a string such as "8.2".';
	}
	if (phpVersion !== '8.5') {
		return `PHPantom 0.11.1 WASI does not apply initializationOptions.phpVersion; this build uses its PHP 8.5 default (received ${phpVersion}).`;
	}
}

export function isStaleDocumentVersion(currentVersion, incomingVersion) {
	return currentVersion !== undefined && incomingVersion <= currentVersion;
}
