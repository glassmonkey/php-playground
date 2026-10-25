import { describe, expect, it } from 'vitest';
import { phpactorVersionError } from '../phpactor-version';

describe('Phpactor analysis version policy', () => {
	it.each([
		{ version: '8.4' as const, error: true },
		{ version: '8.5' as const, error: false },
	])('handles PHP $version', ({ version, error }) => {
		const result = phpactorVersionError(version);

		expect(result === undefined).toBe(!error);
	});
});
