export function phpVersionInitializationError(options, supportedVersions) {
	if (typeof options !== 'object' || options === null) return undefined;
	const phpVersion = options.phpVersion;
	if (phpVersion === undefined) return undefined;
	if (typeof phpVersion !== 'string' || !/^\d+\.\d+$/.test(phpVersion)) {
		return 'initializationOptions.phpVersion must be a string such as "8.2".';
	}
	if (!supportedVersions.includes(phpVersion)) {
		return `PHPantom supports PHP versions ${supportedVersions.join(', ')} (received ${phpVersion}).`;
	}
}

export function isStaleDocumentVersion(currentVersion, incomingVersion) {
	return currentVersion !== undefined && incomingVersion <= currentVersion;
}
