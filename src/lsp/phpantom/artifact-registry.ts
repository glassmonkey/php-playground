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
	stubsCommit: string;
	stubsArchiveSha256: string;
};

const sourceCommit = '49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668';
const sourcePatchSha256 =
	'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d';
const stubsCommit = '2049ca3cfa1feabf52db074108fe776a5713cf02';
const stubsArchiveSha256 =
	'3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7';
const buildIdentity = '49b9a751-phase-b-e12de794';

// Local preview assets remain untracked. The build/publication lane must provide
// these exact reviewed bytes before this preview can be published.
export const reviewedPhpantomArtifacts = {
	'7.4': {
		phpVersion: '7.4',
		url: '/lsp/phpantom/versioned-preview/7.4/phpantom_lsp.wasm',
		sha256: '176d7c61743098b0e4ba6ce74751716e7154e1d9c9885b3788096a426e159bf3',
		bytes: 18_504_747,
		buildIdentity,
		sourceCommit,
		sourcePatchSha256,
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
		sourcePatchSha256,
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
		sourcePatchSha256,
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
		sourcePatchSha256,
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
