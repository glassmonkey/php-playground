import { describe, expect, it } from 'vitest';
import {
	reviewedArtifactFor,
	reviewedPhpVersions,
} from '../phpantom/artifact-registry';
import { versions } from '../../php-wasm/php';
import { phpVersionInitializationError } from '../phpantom/php-version.mjs';

const approvedArtifacts = [
	{
		version: '5.6',
		sha: 'ce8478d55b43041195cf4ffe673eaf94454b784be716549a980be77d2af9a84e',
		sourcePatch:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenance:
			'e6374b9b447c08f1b08daf1d122b72a8a26437d032adbecd764a204cd31e89d2',
	},
	{
		version: '7.0',
		sha: 'e107053e267d4ea0496e7c48d6bde7d9a24ef85cb9d11a11139ecbdf19b78a92',
		sourcePatch:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenance:
			'2fac17832ff5af37194853f35d7a5301892d328947d60cb265e45475cba1dae6',
	},
	{
		version: '7.1',
		sha: '9f01032687b84c5236335d2257655843e1f6e3e78928f0e561ba4a2decf902f1',
		sourcePatch:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenance:
			'94269a430cccac9436c946ccf67058936e3e00760533eff8bacf8f40a7016ae9',
	},
	{
		version: '7.2',
		sha: '68f553533464f950f8315eeaeeda7622f576ac66f32a10d9b12cd9efabe5fba6',
		sourcePatch:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenance:
			'2332b525b3818eaa9e603e3669a58649d838d7fcecc0a81e48a9ec2d26ad60dd',
	},
	{
		version: '7.3',
		sha: '137936ae50c3f64baa9a158686b90171e2df46d029e016b37c21353e70bbb155',
		sourcePatch:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenance:
			'7d790f72f63fc4e11d60ae5bc05b47a8fb96b49b0903fd8b7373de46545a26ef',
	},
	{
		version: '7.4',
		sha: '176d7c61743098b0e4ba6ce74751716e7154e1d9c9885b3788096a426e159bf3',
		sourcePatch:
			'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
		provenance:
			'461ce0cc092a2a88d1ee6bf0c293400dda1653d28b23a9006723047d983bab75',
	},
	{
		version: '8.0',
		sha: '7c874fef41f7082b20f437469945904c3d2d542861cce36dffccef0b8751430a',
		sourcePatch:
			'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
		provenance:
			'cd9ce752aa3dd767094277623a42ace8d7dae8d8aefd8985b040dfd2a9582dfa',
	},
	{
		version: '8.1',
		sha: '03a1da060d8db46c114f503d0b24f5a5cbfbcbf49dcf26a44bdce08ef414ff9a',
		sourcePatch:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenance:
			'c668804ea89ff83ea92d622fe2813c59acc52856c60ce15baca57b92f1a1fa8b',
	},
	{
		version: '8.2',
		sha: '054047f6ebff5d305c68a099834326ccfb9ae57549e0c59d4e59aed55a2f7ef4',
		sourcePatch:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenance:
			'09281de10d134146ec08d24e239416069d4dfb72e51dc0b475b4688c22b9b8ff',
	},
	{
		version: '8.3',
		sha: '7dc6dc0d0520e93ce343a90a1067cd9e3fc9c0c4ea7da114719ec0c401a36c90',
		sourcePatch:
			'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
		provenance:
			'7411671f65f0b2b3c62ebaff2be4f050b2f85efe036399361fd72fc5ab97ebe3',
	},
	{
		version: '8.4',
		sha: '8a677958dc98b3838755eee9c17396ad1a353366601a0f1992373c3ea50bc5f7',
		sourcePatch:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenance:
			'68f65d467e49847c03dc3eae2de24fca33f3966126c25e922f87e696561e4109',
	},
	{
		version: '8.5',
		sha: 'e3ce4b1977686f1f0ac8f401b46d248f63a663a54340d40e557cb6568f28560d',
		sourcePatch:
			'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
		provenance:
			'34789772dc38fe1594864537f2eae29a3ec92201e12f6c041ac88f9f823cebf0',
	},
];

describe('reviewed PHPantom preview artifact registry', () => {
	it('binds every supported PHP target to its exact batch-gated artifact and source provenance', () => {
		expect(reviewedPhpVersions()).toEqual(versions);
		for (const expected of approvedArtifacts) {
			expect(reviewedArtifactFor(expected.version)).toEqual({
				phpVersion: expected.version,
				url: `/lsp/phpantom/php-${expected.version}.wasm`,
				sha256: expected.sha,
				bytes: 18_504_747,
				buildIdentity: '49b9a751-phase-b-e12de794',
				sourceCommit: '49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668',
				sourcePatchSha256: expected.sourcePatch,
				provenanceSha256: expected.provenance,
				stubsCommit: '2049ca3cfa1feabf52db074108fe776a5713cf02',
				stubsArchiveSha256:
					'3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7',
			});
		}
	});

	it('does not select an artifact for an unsupported PHP target', () => {
		expect(reviewedArtifactFor('9.0')).toBeUndefined();
		expect(reviewedArtifactFor(undefined)).toBeUndefined();
	});

	it('accepts every app target and preserves missing, malformed, and unknown version errors', () => {
		for (const version of versions) {
			expect(
				phpVersionInitializationError(
					{ phpVersion: version },
					reviewedPhpVersions()
				)
			).toBeUndefined();
		}
		expect(
			phpVersionInitializationError({}, reviewedPhpVersions())
		).toBeUndefined();
		expect(
			phpVersionInitializationError(
				{ phpVersion: '8x' },
				reviewedPhpVersions()
			)
		).toBe(
			'initializationOptions.phpVersion must be a string such as "8.2".'
		);
		expect(
			phpVersionInitializationError(
				{ phpVersion: '9.0' },
				reviewedPhpVersions()
			)
		).toContain('received 9.0');
	});
});
