export function phpVersionInitializationError(options) {
	if (typeof options !== 'object' || options === null) return undefined;
	const phpVersion = options.phpVersion;
	if (phpVersion === undefined) return undefined;
	if (typeof phpVersion !== 'string' || !/^\d+\.\d+$/.test(phpVersion)) {
		return 'initializationOptions.phpVersion must be a string such as "8.2".';
	}
	if (phpVersion !== '7.4' && phpVersion !== '8.5') {
		return `PHPantom preview supports PHP 7.4 and 8.5 only (received ${phpVersion}).`;
	}
}

export function isStaleDocumentVersion(currentVersion, incomingVersion) {
	return currentVersion !== undefined && incomingVersion <= currentVersion;
}
