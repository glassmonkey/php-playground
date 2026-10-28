export function phpVersionInitializationError(
	options: unknown,
	supportedVersions: readonly string[]
): string | undefined;

export function isStaleDocumentVersion(
	currentVersion: number | undefined,
	incomingVersion: number
): boolean;

export function phpVersionCapabilities(phpVersion: string): {
	namedArguments: boolean;
};

export function applyPhpVersionCompletionFeatures(
	method: string,
	result: unknown,
	phpVersion: string
): unknown;
