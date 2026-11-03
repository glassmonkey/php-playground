export function phpVersionInitializationError(
	options: unknown,
	supportedVersions: readonly string[]
): string | undefined;

export function isStaleDocumentVersion(
	currentVersion: number | undefined,
	incomingVersion: number
): boolean;
