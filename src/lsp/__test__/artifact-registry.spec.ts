import { describe, expect, it } from 'vitest';
import {
	reviewedArtifactFor,
	reviewedPhpVersions,
} from '../phpantom/artifact-registry';

describe('reviewed PHPantom preview artifact registry', () => {
	it('selects only the four manifest-reviewed PHP targets by version', () => {
		expect(reviewedPhpVersions()).toEqual(['7.4', '8.0', '8.3', '8.5']);
		expect(reviewedArtifactFor('7.4')).toMatchObject({
			phpVersion: '7.4',
			sha256: '176d7c61743098b0e4ba6ce74751716e7154e1d9c9885b3788096a426e159bf3',
			bytes: 18_504_747,
		});
		expect(reviewedArtifactFor('8.0')).toMatchObject({
			phpVersion: '8.0',
			sha256: '7c874fef41f7082b20f437469945904c3d2d542861cce36dffccef0b8751430a',
		});
		expect(reviewedArtifactFor('8.3')).toMatchObject({
			phpVersion: '8.3',
			sha256: '7dc6dc0d0520e93ce343a90a1067cd9e3fc9c0c4ea7da114719ec0c401a36c90',
		});
		expect(reviewedArtifactFor('8.5')).toMatchObject({
			phpVersion: '8.5',
			sha256: 'e3ce4b1977686f1f0ac8f401b46d248f63a663a54340d40e557cb6568f28560d',
		});
	});

	it('does not select an artifact for an unreviewed PHP target', () => {
		expect(reviewedArtifactFor('8.4')).toBeUndefined();
		expect(reviewedArtifactFor('7.3')).toBeUndefined();
		expect(reviewedArtifactFor(undefined)).toBeUndefined();
	});
});
