import type { Version } from '../../php-wasm/php';
import { reviewedArtifactFor, reviewedPhpVersions } from './artifact-registry';

const modules = new Map<string, Promise<WebAssembly.Module>>();

function cacheKey(version: Version, sha256: string) {
	return `${version}:${sha256}`;
}

async function fetchModule(
	version: Version,
	signal: AbortSignal
): Promise<WebAssembly.Module> {
	const artifact = reviewedArtifactFor(version);
	if (!artifact) {
		throw new Error(
			`PHPantom versioned preview is verified only for PHP ${reviewedPhpVersions().join(', ')}; PHP ${version} has no reviewed WASM artifact.`
		);
	}

	const response = await fetch(`${artifact.url}?sha256=${artifact.sha256}`, {
		cache: 'force-cache',
		signal,
	});
	if (!response.ok) {
		throw new Error(
			`Could not load PHPantom PHP ${version} preview WASM (${response.status}).`
		);
	}
	const bytes = await response.arrayBuffer();
	if (bytes.byteLength !== artifact.bytes) {
		throw new Error(
			`PHPantom PHP ${version} WASM size mismatch: expected ${artifact.bytes}, received ${bytes.byteLength}.`
		);
	}
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const actualSha256 = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
	if (actualSha256 !== artifact.sha256) {
		throw new Error(
			`PHPantom PHP ${version} WASM SHA-256 mismatch: expected ${artifact.sha256}, received ${actualSha256}.`
		);
	}
	return WebAssembly.compile(bytes);
}

// Loading includes download, integrity verification and compilation, not RPC work.
const MODULE_LOAD_TIMEOUT_MS = 60_000;
async function loadModule(version: Version): Promise<WebAssembly.Module> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(
				new Error(`PHPantom PHP ${version} WASM loading timed out.`)
			);
		}, MODULE_LOAD_TIMEOUT_MS);
	});
	try {
		return await Promise.race([
			fetchModule(version, controller.signal),
			timeout,
		]);
	} finally {
		clearTimeout(timer);
	}
}

export function compiledPhpantomModule(
	version: Version
): Promise<WebAssembly.Module> {
	const artifact = reviewedArtifactFor(version);
	if (!artifact) return loadModule(version);
	const key = cacheKey(version, artifact.sha256);
	let module = modules.get(key);
	if (!module) {
		module = loadModule(version).catch((error: unknown) => {
			modules.delete(key);
			throw error;
		});
		modules.set(key, module);
	}
	return module;
}
