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
const buildIdentity = '49b9a751-phase-b-e12de794';

// Local candidate files are verified against the manager's released batch gate.
// They remain outside git until the separate UI review approves binary publication.
export const reviewedPhpantomArtifacts = {
	'5.6': {
		phpVersion: '5.6',
		url: '/lsp/phpantom/versioned-preview/5.6/phpantom_lsp.wasm',
		sha256: 'ce8478d55b43041195cf4ffe673eaf94454b784be716549a980be77d2af9a84e',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenanceSha256:
			'e6374b9b447c08f1b08daf1d122b72a8a26437d032adbecd764a204cd31e89d2',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.0': {
		phpVersion: '7.0',
		url: '/lsp/phpantom/versioned-preview/7.0/phpantom_lsp.wasm',
		sha256: 'e107053e267d4ea0496e7c48d6bde7d9a24ef85cb9d11a11139ecbdf19b78a92',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenanceSha256:
			'2fac17832ff5af37194853f35d7a5301892d328947d60cb265e45475cba1dae6',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.1': {
		phpVersion: '7.1',
		url: '/lsp/phpantom/versioned-preview/7.1/phpantom_lsp.wasm',
		sha256: '9f01032687b84c5236335d2257655843e1f6e3e78928f0e561ba4a2decf902f1',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenanceSha256:
			'94269a430cccac9436c946ccf67058936e3e00760533eff8bacf8f40a7016ae9',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.2': {
		phpVersion: '7.2',
		url: '/lsp/phpantom/versioned-preview/7.2/phpantom_lsp.wasm',
		sha256: '68f553533464f950f8315eeaeeda7622f576ac66f32a10d9b12cd9efabe5fba6',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenanceSha256:
			'2332b525b3818eaa9e603e3669a58649d838d7fcecc0a81e48a9ec2d26ad60dd',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.3': {
		phpVersion: '7.3',
		url: '/lsp/phpantom/versioned-preview/7.3/phpantom_lsp.wasm',
		sha256: '137936ae50c3f64baa9a158686b90171e2df46d029e016b37c21353e70bbb155',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenanceSha256:
			'7d790f72f63fc4e11d60ae5bc05b47a8fb96b49b0903fd8b7373de46545a26ef',
		stubsCommit,
		stubsArchiveSha256,
	},
	'7.4': {
		phpVersion: '7.4',
		url: '/lsp/phpantom/versioned-preview/7.4/phpantom_lsp.wasm',
		sha256: '176d7c61743098b0e4ba6ce74751716e7154e1d9c9885b3788096a426e159bf3',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
		provenanceSha256:
			'461ce0cc092a2a88d1ee6bf0c293400dda1653d28b23a9006723047d983bab75',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.0': {
		phpVersion: '8.0',
		url: '/lsp/phpantom/versioned-preview/8.0/phpantom_lsp.wasm',
		sha256: '7c874fef41f7082b20f437469945904c3d2d542861cce36dffccef0b8751430a',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
		provenanceSha256:
			'cd9ce752aa3dd767094277623a42ace8d7dae8d8aefd8985b040dfd2a9582dfa',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.1': {
		phpVersion: '8.1',
		url: '/lsp/phpantom/versioned-preview/8.1/phpantom_lsp.wasm',
		sha256: '03a1da060d8db46c114f503d0b24f5a5cbfbcbf49dcf26a44bdce08ef414ff9a',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenanceSha256:
			'c668804ea89ff83ea92d622fe2813c59acc52856c60ce15baca57b92f1a1fa8b',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.2': {
		phpVersion: '8.2',
		url: '/lsp/phpantom/versioned-preview/8.2/phpantom_lsp.wasm',
		sha256: '054047f6ebff5d305c68a099834326ccfb9ae57549e0c59d4e59aed55a2f7ef4',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenanceSha256:
			'09281de10d134146ec08d24e239416069d4dfb72e51dc0b475b4688c22b9b8ff',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.3': {
		phpVersion: '8.3',
		url: '/lsp/phpantom/versioned-preview/8.3/phpantom_lsp.wasm',
		sha256: '7dc6dc0d0520e93ce343a90a1067cd9e3fc9c0c4ea7da114719ec0c401a36c90',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
		provenanceSha256:
			'7411671f65f0b2b3c62ebaff2be4f050b2f85efe036399361fd72fc5ab97ebe3',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.4': {
		phpVersion: '8.4',
		url: '/lsp/phpantom/versioned-preview/8.4/phpantom_lsp.wasm',
		sha256: '8a677958dc98b3838755eee9c17396ad1a353366601a0f1992373c3ea50bc5f7',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d',
		provenanceSha256:
			'68f65d467e49847c03dc3eae2de24fca33f3966126c25e922f87e696561e4109',
		stubsCommit,
		stubsArchiveSha256,
	},
	'8.5': {
		phpVersion: '8.5',
		url: '/lsp/phpantom/versioned-preview/8.5/phpantom_lsp.wasm',
		sha256: 'e3ce4b1977686f1f0ac8f401b46d248f63a663a54340d40e557cb6568f28560d',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256:
			'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
		provenanceSha256:
			'34789772dc38fe1594864537f2eae29a3ec92201e12f6c041ac88f9f823cebf0',
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
