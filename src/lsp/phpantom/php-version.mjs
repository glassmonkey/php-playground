export function phpVersionInitializationError(options, supportedVersions) {
	if (typeof options !== 'object' || options === null) {
		return 'initializationOptions.phpVersion is required.';
	}
	const phpVersion = options.phpVersion;
	if (phpVersion === undefined) {
		return 'initializationOptions.phpVersion is required.';
	}
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

// Pinned PHPantom's named-argument provider emits these details; CompletionItemKind.Variable also covers ordinary variables.
const namedArgumentCompletionDetails = new Set([
	'Named argument',
	'Named argument (optional)',
	'Named argument (variadic)',
]);

export function phpVersionCapabilities(phpVersion) {
	const match = /^(\d+)\.(\d+)$/.exec(phpVersion);
	if (!match) return { namedArguments: false };
	const major = Number(match[1]);
	const minor = Number(match[2]);
	return { namedArguments: major > 8 || (major === 8 && minor >= 0) };
}

export function applyPhpVersionCompletionFeatures(method, result, phpVersion) {
	if (
		method !== 'textDocument/completion' ||
		phpVersionCapabilities(phpVersion).namedArguments
	) {
		return result;
	}

	if (Array.isArray(result)) return filterNamedArgumentItems(result);
	if (
		typeof result !== 'object' ||
		result === null ||
		!Array.isArray(result.items)
	) {
		return result;
	}

	return { ...result, items: filterNamedArgumentItems(result.items) };
}

function filterNamedArgumentItems(items) {
	return items.filter(
		(item) =>
			typeof item?.detail !== 'string' ||
			!namedArgumentCompletionDetails.has(item.detail)
	);
}
