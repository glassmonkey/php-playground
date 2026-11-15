import type { Version } from '../../php-wasm/php';

export type PhpantomWorkerBootstrapMessage = {
	type: 'phpantom:bootstrap';
	phpVersion: Version;
	module?: WebAssembly.Module;
	error?: string;
};

export function isPhpantomWorkerBootstrapMessage(
	value: unknown
): value is PhpantomWorkerBootstrapMessage {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		return false;
	const message = value as Record<string, unknown>;
	return (
		message.type === 'phpantom:bootstrap' &&
		typeof message.phpVersion === 'string' &&
		(message.module === undefined ||
			message.module instanceof WebAssembly.Module) &&
		(message.error === undefined || typeof message.error === 'string')
	);
}

export type ReviewedArtifact = {
	phpVersion: Version;
	url: string;
	sha256: string;
	bytes: number;
	buildIdentity: string;
	sourceCommit: string;
	sourcePatchSha256: string;
	provenanceSha256: string;
	stubsCommit: string;
	stubsArchiveSha256: string;
};

const sourceCommit = '49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668';
const stubsCommit = '2049ca3cfa1feabf52db074108fe776a5713cf02';
const stubsArchiveSha256 =
	'3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7';
const buildIdentity = '49b9a751-release-0581b67c';

// The reviewed versioned artifact bytes are committed under assets/lsp/phpantom
// and pinned in manifest.json.
export const reviewedPhpantomArtifacts = {
	'5.6': {
		phpVersion: '5.6',
		url: '/lsp/phpantom/php-5.6.wasm',
		sha256: '8b3faed55092cd08737c9a6336010ecec06c6697b0b7216ae208e4b18dfc2e3c',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'ba69fc31a1562ed500b0c4f1ada481df610b37a690a84a199072471a76220787',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.0': {
		phpVersion: '7.0',
		url: '/lsp/phpantom/php-7.0.wasm',
		sha256: 'b097005661a3993c108c74114ec98b562baf169f60daf7fefb089ccc3974fdbe',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'92a2c06e4ef78d1940233cce6035dae62e3e2991439188987b34471a490f025b',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.1': {
		phpVersion: '7.1',
		url: '/lsp/phpantom/php-7.1.wasm',
		sha256: 'cfcac41df881da99e4a0f70fdd0b48cd3a74894b61ef3f250cc01bcb362990f4',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'c00147db48f230fa2906966bc4ba0d4de1b2fcc4c2f323d92b4dfccce9b95eea',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.2': {
		phpVersion: '7.2',
		url: '/lsp/phpantom/php-7.2.wasm',
		sha256: 'b38823bf72e9af706c3d12350781dd95f159a738eb2a1d3ca2a5c7691b87e3e0',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'11cc72fb6dca93dac99e6dfa6011140d97098d14f7e617c4112afdd013d3cbd9',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.3': {
		phpVersion: '7.3',
		url: '/lsp/phpantom/php-7.3.wasm',
		sha256: '1e4d1fa69d68530befb13f88c9cc364fcb37b3f5798f3810007793040940dabf',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'f2bd1442ae88f0005323cfd75919aa4b0d8fb9b77007662b57cf7c4d1aeef7ec',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.4': {
		phpVersion: '7.4',
		url: '/lsp/phpantom/php-7.4.wasm',
		sha256: 'e62eeb4bab6f8e3ce2f72f0e5bd124ad580a40731c44d283fec26b8565ad7637',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'34c183da15a494bb393f0eba146e880e906411489c3f8269a7d810bda334a2aa',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.0': {
		phpVersion: '8.0',
		url: '/lsp/phpantom/php-8.0.wasm',
		sha256: '261c99df2e953bff2091411e3d59e6398d54a92ff622730320c30e3244c7e5de',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'02acce1a230b939eebb5a06ff597c4ac83b26bf34f541e30de9d3525507b604c',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.1': {
		phpVersion: '8.1',
		url: '/lsp/phpantom/php-8.1.wasm',
		sha256: '875ae148aa5e6e18e65a56709f90fbbe8f039d4bd858c1b9d5de1aa28140b59c',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'781c869391bcc64329158f27fbeef3f2dc2e9ad3157d8bca970a04a4838978cf',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.2': {
		phpVersion: '8.2',
		url: '/lsp/phpantom/php-8.2.wasm',
		sha256: 'f077f6570d46199d71ff93afc0d66b08c4de4c8111d2fba3f4f50e420b4a0694',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'9e67d2fa71fdfe64106e3f4f9caa24f7a6af1b6e81bad6bb69c81acc3286424f',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.3': {
		phpVersion: '8.3',
		url: '/lsp/phpantom/php-8.3.wasm',
		sha256: '4872159c2144932ec5b691c2cde945463e8f33552613161c8318585a328ca5d7',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'3a071c221d8429fcfa5a84b3dad238e6538c6afdfcb7a5f945b12105de503cec',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.4': {
		phpVersion: '8.4',
		url: '/lsp/phpantom/php-8.4.wasm',
		sha256: 'fa43613ae683fafabfc8a7bf9c9f092105f5d3236732a4ad159b80e245b471a5',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'4e36cb01ffff852720f0adc5a0c74a2afad70dd0adc63f1174176be0f036d9f9',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.5': {
		phpVersion: '8.5',
		url: '/lsp/phpantom/php-8.5.wasm',
		sha256: 'd9ca44a41262cc262c4cab16a42976062f4361e1a72ffcb93ab0dc383f5451ac',
		bytes: 19_189_147,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'0581b67c401a5a26f56241d69404cc95a6a658c07e39f6a785dc12181aab8ba6',
		provenanceSha256:
			'8e4ed80875887169526c4756889be4a4ae057d7e2111b20052000e82d5bc5c22',
		stubsCommit,
		stubsArchiveSha256,
	},
} as const satisfies Partial<Record<Version, ReviewedArtifact>>;

export function reviewedArtifactFor(
	version: string | undefined
): ReviewedArtifact | undefined {
	if (!version) return undefined;
	return reviewedPhpantomArtifacts[
		version as keyof typeof reviewedPhpantomArtifacts
	];
}

export function reviewedPhpVersions(): Version[] {
	return Object.keys(reviewedPhpantomArtifacts) as Version[];
}
