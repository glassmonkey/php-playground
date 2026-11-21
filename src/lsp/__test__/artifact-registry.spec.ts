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
		sha: '8b3faed55092cd08737c9a6336010ecec06c6697b0b7216ae208e4b18dfc2e3c',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'ba69fc31a1562ed500b0c4f1ada481df610b37a690a84a199072471a76220787',
	},
	{
		version: '7.0',
		sha: 'b097005661a3993c108c74114ec98b562baf169f60daf7fefb089ccc3974fdbe',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'92a2c06e4ef78d1940233cce6035dae62e3e2991439188987b34471a490f025b',
	},
	{
		version: '7.1',
		sha: 'cfcac41df881da99e4a0f70fdd0b48cd3a74894b61ef3f250cc01bcb362990f4',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'c00147db48f230fa2906966bc4ba0d4de1b2fcc4c2f323d92b4dfccce9b95eea',
	},
	{
		version: '7.2',
		sha: 'b38823bf72e9af706c3d12350781dd95f159a738eb2a1d3ca2a5c7691b87e3e0',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'11cc72fb6dca93dac99e6dfa6011140d97098d14f7e617c4112afdd013d3cbd9',
	},
	{
		version: '7.3',
		sha: '1e4d1fa69d68530befb13f88c9cc364fcb37b3f5798f3810007793040940dabf',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'f2bd1442ae88f0005323cfd75919aa4b0d8fb9b77007662b57cf7c4d1aeef7ec',
	},
	{
		version: '7.4',
		sha: 'e62eeb4bab6f8e3ce2f72f0e5bd124ad580a40731c44d283fec26b8565ad7637',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'34c183da15a494bb393f0eba146e880e906411489c3f8269a7d810bda334a2aa',
	},
	{
		version: '8.0',
		sha: '261c99df2e953bff2091411e3d59e6398d54a92ff622730320c30e3244c7e5de',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'02acce1a230b939eebb5a06ff597c4ac83b26bf34f541e30de9d3525507b604c',
	},
	{
		version: '8.1',
		sha: '875ae148aa5e6e18e65a56709f90fbbe8f039d4bd858c1b9d5de1aa28140b59c',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'781c869391bcc64329158f27fbeef3f2dc2e9ad3157d8bca970a04a4838978cf',
	},
	{
		version: '8.2',
		sha: 'f077f6570d46199d71ff93afc0d66b08c4de4c8111d2fba3f4f50e420b4a0694',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'9e67d2fa71fdfe64106e3f4f9caa24f7a6af1b6e81bad6bb69c81acc3286424f',
	},
	{
		version: '8.3',
		sha: '4872159c2144932ec5b691c2cde945463e8f33552613161c8318585a328ca5d7',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'3a071c221d8429fcfa5a84b3dad238e6538c6afdfcb7a5f945b12105de503cec',
	},
	{
		version: '8.4',
		sha: 'fa43613ae683fafabfc8a7bf9c9f092105f5d3236732a4ad159b80e245b471a5',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'4e36cb01ffff852720f0adc5a0c74a2afad70dd0adc63f1174176be0f036d9f9',
	},
	{
		version: '8.5',
		sha: 'd9ca44a41262cc262c4cab16a42976062f4361e1a72ffcb93ab0dc383f5451ac',
		sourcePatch:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenance:
			'8e4ed80875887169526c4756889be4a4ae057d7e2111b20052000e82d5bc5c22',
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
				bytes: 19_189_147,
				buildIdentity: '49b9a751-release-0581b67c',
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
