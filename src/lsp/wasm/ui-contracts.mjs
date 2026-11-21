// PHP targets are an independent public contract, not inferred from a selected subset.
export const expectedPhpTargets = Object.freeze([
	'5.6',
	'7.0',
	'7.1',
	'7.2',
	'7.3',
	'7.4',
	'8.0',
	'8.1',
	'8.2',
	'8.3',
	'8.4',
	'8.5',
]);
export function parseMatrixManifest(text) {
	const parsed = JSON.parse(text);
	// JSON.parse discards duplicate keys. Check object keys before accepting its result.
	const stack = [];
	for (const token of text.match(
		/"(?:\\.|[^"\\])*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g
	) ?? []) {
		if (token === '{')
			stack.push({ object: true, key: true, seen: new Set() });
		else if (token === '[') stack.push({ object: false });
		else if (token === '}' || token === ']') stack.pop();
		else if (token === ',') {
			if (stack.at(-1)?.object) stack.at(-1).key = true;
		} else if (token === ':') {
			if (stack.at(-1)?.object) stack.at(-1).key = false;
		} else if (
			token.startsWith('"') &&
			stack.at(-1)?.object &&
			stack.at(-1).key
		) {
			const key = JSON.parse(token),
				frame = stack.at(-1);
			if (frame.seen.has(key))
				throw new Error(`Duplicate manifest key: ${key}`);
			frame.seen.add(key);
		}
	}
	return parsed;
}
export function validateMatrixInputs(batch, selection) {
	if (
		batch.schemaVersion !== 1 ||
		typeof batch.buildIdentity !== 'string' ||
		!batch.artifacts ||
		Array.isArray(batch.artifacts)
	)
		throw new Error('Invalid artifact manifest schema');
	const keys = Object.keys(batch.artifacts);
	const missing = expectedPhpTargets.filter((v) => !keys.includes(v)),
		unexpected = keys.filter((v) => !expectedPhpTargets.includes(v));
	if (missing.length || unexpected.length)
		throw new Error(
			`Manifest target mismatch: missing=${missing.join(',')}; unexpected=${unexpected.join(',')}`
		);
	if (!selection.length) throw new Error('Empty matrix selection');
	if (new Set(selection).size !== selection.length)
		throw new Error('Duplicate matrix selection');
	if (selection.some((v) => !expectedPhpTargets.includes(v)))
		throw new Error('Unexpected matrix selection');
	return Object.entries(batch.artifacts).map(([phpVersion, artifact]) => ({
		phpVersion,
		...artifact,
	}));
}
// Pinned PHP signature metadata. Parameter order and zero-based active argument are contractual.
export function expectedStrrchrSignature(version) {
	if (!expectedPhpTargets.includes(version))
		throw new Error('Unexpected signature target');
	const newer = ['8.3', '8.4', '8.5'].includes(version);
	return {
		functionName: 'strrchr',
		signatures: [
			{
				label: newer
					? '(string $haystack, string $needle, bool $before_needle = false): string|false'
					: '(string $haystack, string $needle): string|false',
				parameters: newer
					? [
							'string $haystack',
							'string $needle',
							'bool $before_needle = false',
						]
					: ['string $haystack', 'string $needle'],
			},
		],
		activeSignature: 0,
		activeParameter: newer ? 2 : 1,
	};
}
